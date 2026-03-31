import { Console, Effect } from "effect";
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
 * Process a single pull request through the complete review workflow:
 * 1. Claim the PR by adding a label
 * 2. Post "in progress" comment to GitHub
 * 3. Get PR details (file list for classification)
 * 4. Classify the PR based on changed files
 * 5. Select appropriate review skill
 * 6. Generate review using Claude's /review command
 * 7. Update the initial comment with the review content
 *
 * If any step after claiming fails, the initial comment is updated with an error
 * and the claim label is automatically removed to allow retry.
 *
 * @param repo - Repository in format "owner/repo"
 * @param prNumber - Pull request number
 * @param label - Label to use for claiming the PR
 * @param config - Configuration with skill mappings
 * @returns Effect that resolves to review content or WorkflowError
 */
export const processPR = (
  repo: string,
  prNumber: number,
  label: string,
  config: Config
): Effect.Effect<string, WorkflowError, GitHubService | ClassificationService | ReviewService> =>
  Effect.gen(function* () {
    const github = yield* GitHubService;
    const classification = yield* ClassificationService;
    const review = yield* ReviewService;

    // Step 1: Claim the PR
    // If this fails, we should NOT remove the label (PR is already claimed by someone else)
    yield* Console.log(`[Workflow] Claiming PR #${prNumber} with label: ${label}`);
    yield* github.claimPR(repo, prNumber, label);
    yield* Console.log(`[Workflow] Successfully claimed PR #${prNumber}`);

    // Step 2: Post initial "in progress" comment
    yield* Console.log(`[Workflow] Posting initial comment to PR #${prNumber}`);
    const commentId = yield* github.postCommentWithId(
      repo,
      prNumber,
      "🤖 **review-rock is analyzing this PR...**\n\nGenerating review, please wait..."
    );
    yield* Console.log(`[Workflow] Posted comment #${commentId} to PR #${prNumber}`);

    // All subsequent steps run with claim label release on failure
    // This uses acquireRelease pattern: acquire = claim, release = remove label on error
    const reviewContent = yield* Effect.gen(function* () {
      // Step 3: Get PR details (just file list for classification)
      const details = yield* github.getPRDetails(repo, prNumber);

      // Step 4: Classify the PR based on changed files
      const classificationResult = yield* classification.classifyPR(details.files);
      yield* Console.log(
        `[Workflow] PR #${prNumber} classified as: ${classificationResult.type}`
      );

      // Step 5: Select skill based on classification
      const skillName = selectSkillForClassification(classificationResult.type, config);
      yield* Console.log(`[Workflow] Using skill: ${skillName}`);

      // Step 6: Generate review using Claude's built-in /review command
      // Claude will fetch the diff itself and handle the review
      const reviewContent = yield* review.generateReview(
        {
          repo,
          prNumber,
          diff: "", // Not needed - Claude /review fetches it
          details,
        },
        skillName
      );

      // Step 7: Update the comment with the review content
      yield* Console.log(`[Workflow] Updating comment #${commentId} with review content`);
      yield* github.updateComment(repo, commentId, reviewContent);
      yield* Console.log(`[Workflow] Successfully updated comment #${commentId} on PR #${prNumber}`);

      return reviewContent;
    }).pipe(
      // Release claim label if anything goes wrong after claiming
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          // Update comment with error message
          yield* Console.log(`[Workflow] Error occurred, updating comment with error message`);
          const errorMessage = `❌ **review-rock encountered an error**\n\n${String(error)}\n\nThe PR has been unclaimed and can be retried.`;
          yield* github.updateComment(repo, commentId, errorMessage).pipe(
            // If comment update fails, log but continue
            Effect.catchAll(() => Effect.void)
          );

          // Remove the label to allow retry
          yield* Console.log(`[Workflow] Removing claim label from PR #${prNumber}`);
          yield* github.removeLabel(repo, prNumber, label).pipe(
            // If label removal fails, log but don't fail the whole operation
            Effect.catchAll(() => Effect.void)
          );
          // Re-throw the original error
          return yield* Effect.fail(error);
        })
      )
    );

    return reviewContent;
  });
