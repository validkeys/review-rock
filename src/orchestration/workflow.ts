import { Effect } from "effect";
import type { Config } from "../config/schema.js";
import type {
  GitHubCommandError,
  LabelClaimFailedError,
  PRNotFoundError,
} from "../errors/github.js";
import { ClassificationService } from "../services/classification.js";
import { GitHubService } from "../services/github.js";
import type { ReviewError } from "../services/review.js";
import { ReviewService } from "../services/review.js";

/**
 * Union type of all possible workflow errors
 */
export type WorkflowError =
  | LabelClaimFailedError
  | PRNotFoundError
  | GitHubCommandError
  | ReviewError
  | Error;

/**
 * Select skill name based on PR classification
 * @param classification - The classification result (frontend, backend, or mixed)
 * @param config - Configuration containing skill mappings
 * @returns Skill name to use for review
 */
const selectSkillForClassification = (
  classification: "frontend" | "backend" | "mixed",
  config: Config
): string => {
  switch (classification) {
    case "frontend":
      return config.skills.frontend;
    case "backend":
      return config.skills.backend;
    case "mixed":
      return config.skills.mixed;
  }
};

/**
 * Determines the appropriate label based on the review content
 * Analyzes the review text for critical issues and verdict
 * @param reviewContent - The generated review text
 * @returns "approved" or "refactor-required"
 */
const determineReviewLabel = (reviewContent: string): "approved" | "refactor-required" => {
  const lowerContent = reviewContent.toLowerCase();

  // Check for explicit verdict
  if (lowerContent.includes("approve ✅") || lowerContent.includes("verdict: approve")) {
    return "approved";
  }

  if (
    lowerContent.includes("request changes ❌") ||
    lowerContent.includes("verdict: request changes")
  ) {
    return "refactor-required";
  }

  // Check for critical issues (🔴)
  if (lowerContent.includes("🔴") || lowerContent.includes("critical")) {
    return "refactor-required";
  }

  // Default to refactor-required (safer default)
  return "refactor-required";
};

/**
 * Process a single pull request through the complete review workflow:
 * 1. Remove "ready-for-review" label and add "review-in-progress" label
 * 2. Post "analyzing..." comment to GitHub
 * 3. Get PR details (file list for classification)
 * 4. Classify the PR based on changed files
 * 5. Select appropriate review skill
 * 6. Generate review using Claude's /review command
 * 7. Ask LLM to determine if PR should be approved or needs refactoring
 * 8. Update the comment with the review content
 * 9. Add the appropriate label (approved or refactor-required)
 *
 * If any step fails, the comment is updated with an error, "review-in-progress"
 * is removed, and "ready-for-review" is re-added to allow retry.
 *
 * @param repo - Repository in format "owner/repo"
 * @param prNumber - Pull request number
 * @param config - Configuration with labels and skill mappings
 * @returns Effect that resolves to review content or WorkflowError
 */
export const processPR = (
  repo: string,
  prNumber: number,
  config: Config
): Effect.Effect<string, WorkflowError, GitHubService | ClassificationService | ReviewService> =>
  Effect.gen(function* () {
    const github = yield* GitHubService;
    const classification = yield* ClassificationService;
    const review = yield* ReviewService;

    // Add PR number to all logs in this workflow
    const logWithPR = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.annotateLogs("pr", prNumber));

    // Step 1: Swap labels - remove "ready-for-review", add "review-in-progress"
    yield* logWithPR(Effect.logInfo(`Starting review - swapping labels`));
    yield* github.removeLabel(repo, prNumber, config.labels.readyForReview);
    yield* github.addLabel(repo, prNumber, config.labels.reviewInProgress);
    yield* logWithPR(Effect.logInfo(`Added ${config.labels.reviewInProgress} label`));

    // Step 2: Post initial "analyzing..." comment
    yield* logWithPR(Effect.logInfo(`Posting initial comment`));
    const commentId = yield* github.postCommentWithId(
      repo,
      prNumber,
      "🤖 **review-rock is analyzing this PR...**\n\nGenerating review, please wait..."
    );
    yield* logWithPR(Effect.logInfo(`Posted comment #${commentId}`));

    // All subsequent steps run with error handling to reset labels on failure
    const reviewContent = yield* Effect.gen(function* () {
      // Step 3: Get PR details (just file list for classification)
      const details = yield* github.getPRDetails(repo, prNumber);

      // Step 4: Classify the PR based on changed files
      const classificationResult = yield* classification.classifyPR(details.files);
      yield* logWithPR(Effect.logInfo(`Classified as: ${classificationResult.type}`));

      // Step 5: Select skill based on classification
      const skillName = selectSkillForClassification(classificationResult.type, config);
      yield* logWithPR(Effect.logInfo(`Using skill: ${skillName}`));

      // Step 6: Generate review using Claude's built-in /review command
      const reviewContent = yield* review.generateReview(
        {
          repo,
          prNumber,
          diff: "", // Not needed - Claude /review fetches it
          details,
        },
        skillName
      );

      // Step 7: Determine the appropriate label based on review content
      yield* logWithPR(Effect.logInfo(`Determining review outcome label`));
      const labelDecision = determineReviewLabel(reviewContent);
      const finalLabel =
        labelDecision === "approved"
          ? config.labels.reviewApproved
          : config.labels.reviewRefactorRequired;
      yield* logWithPR(Effect.logInfo(`Review decision: ${labelDecision} -> ${finalLabel}`));

      // Step 8: Update the comment with the review content
      yield* logWithPR(Effect.logInfo(`Updating comment #${commentId} with review`));
      yield* github.updateComment(repo, commentId, reviewContent);
      yield* logWithPR(Effect.logInfo(`Successfully updated comment #${commentId}`));

      // Step 9: Remove "review-in-progress" and add the final label
      yield* logWithPR(Effect.logInfo(`Removing ${config.labels.reviewInProgress} label`));
      yield* github.removeLabel(repo, prNumber, config.labels.reviewInProgress);
      yield* logWithPR(Effect.logInfo(`Adding ${finalLabel} label`));
      yield* github.addLabel(repo, prNumber, finalLabel);
      yield* logWithPR(Effect.logInfo(`Review complete`));

      return reviewContent;
    }).pipe(
      // Reset labels if anything goes wrong
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          // Update comment with error message
          yield* logWithPR(Effect.logError(`Error occurred: ${String(error)}`));
          yield* logWithPR(Effect.logInfo(`Updating comment with error message`));
          const errorMessage = `❌ **review-rock encountered an error**\n\n${String(error)}\n\nThe PR label has been reset to "${config.labels.readyForReview}" and can be retried.`;
          yield* github.updateComment(repo, commentId, errorMessage).pipe(
            Effect.catchAll(() => Effect.void)
          );

          // Reset labels: remove reviewInProgress, re-add readyForReview
          yield* logWithPR(Effect.logInfo(`Resetting labels after error`));
          yield* github.removeLabel(repo, prNumber, config.labels.reviewInProgress).pipe(
            Effect.catchAll(() => Effect.void)
          );
          yield* github.addLabel(repo, prNumber, config.labels.readyForReview).pipe(
            Effect.catchAll(() => Effect.void)
          );

          // Re-throw the original error
          return yield* Effect.fail(error);
        })
      )
    );

    return reviewContent;
  });
