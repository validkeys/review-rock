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
 * 2. Get PR details and diff
 * 3. Classify the PR based on changed files
 * 4. Select appropriate review skill
 * 5. Generate review using Claude Code
 * 6. Post review comment to GitHub
 *
 * If any step after claiming fails, the claim label is automatically removed
 * to allow retry by another instance.
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

    // All subsequent steps run with claim label release on failure
    // This uses acquireRelease pattern: acquire = claim, release = remove label on error
    const reviewContent = yield* Effect.gen(function* () {
      // Step 2: Get PR details (just file list for classification)
      const details = yield* github.getPRDetails(repo, prNumber);

      // Step 3: Classify the PR based on changed files
      const classificationResult = yield* classification.classifyPR(details.files);
      yield* Console.log(
        `[Workflow] PR #${prNumber} classified as: ${classificationResult.type}`
      );

      // Step 4: Select skill based on classification
      const skillName = selectSkillForClassification(classificationResult.type, config);
      yield* Console.log(`[Workflow] Using skill: ${skillName}`);

      // Step 5: Generate review using Claude's built-in /review command
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

      // Step 6: Post comment to GitHub
      // TEMPORARILY DISABLED FOR TESTING - review is saved to /tmp/review-rock-debug-*.md
      yield* Console.log(`[Workflow] SKIPPING posting to GitHub (disabled for testing)`);
      yield* Console.log(`[Workflow] Review generated successfully for PR #${prNumber}`);
      // yield* github.postComment(repo, prNumber, reviewContent);
      // yield* Console.log(`[Workflow] Successfully posted comment to PR #${prNumber}`);

      return reviewContent;
    }).pipe(
      // Release claim label if anything goes wrong after claiming
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          // Remove the label to allow retry
          yield* Console.log(`[Workflow] Error occurred, removing claim label from PR #${prNumber}`);
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
