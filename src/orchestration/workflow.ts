import { Duration, Effect, Schedule } from "effect";
import type { Config } from "../config/schema.js";
import type {
  GitHubCommandError,
  LabelClaimFailedError,
  PRNotFoundError,
} from "../errors/github.js";
import {
  AWSTokenExpiredError,
  ClaudeCodeCommandError,
  SkillNotFoundError,
} from "../errors/review.js";
import { ClassificationService } from "../services/classification.js";
import { GitHubService } from "../services/github.js";
import type { ReviewError } from "../services/review.js";
import { ReviewService } from "../services/review.js";
import { TeamsNotificationService } from "../services/teams-notification.js";
import { buildReviewNotificationData } from "../utils/review-parser.js";

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
 * Determines if an error is transient (should retry) or permanent (should fail)
 *
 * Transient errors:
 * - AWS token expired (user needs to refresh, then auto-retry)
 * - Network errors (computer sleep, network down)
 * - GitHub rate limits (temporary throttling)
 * - Command timeout
 *
 * Permanent errors:
 * - Skill not found (needs manual installation)
 * - Invalid configuration
 * - Permission denied
 */
const isTransientError = (error: WorkflowError): boolean => {
  // AWS token expiry - user will refresh, then we retry
  if (error instanceof AWSTokenExpiredError) {
    return true;
  }

  // Check error message for transient patterns
  const errorMessage = String(error).toLowerCase();

  // Network-related errors
  if (
    errorMessage.includes("econnrefused") ||
    errorMessage.includes("enotfound") ||
    errorMessage.includes("etimedout") ||
    errorMessage.includes("network") ||
    errorMessage.includes("timeout")
  ) {
    return true;
  }

  // GitHub rate limiting
  if (errorMessage.includes("rate limit") || errorMessage.includes("too many requests")) {
    return true;
  }

  // Command execution failures (might be transient)
  if (error instanceof ClaudeCodeCommandError) {
    // Check if it's a transient command failure
    if (
      errorMessage.includes("timeout") ||
      errorMessage.includes("network") ||
      errorMessage.includes("connection")
    ) {
      return true;
    }
  }

  // Skill not found is permanent - needs installation
  if (error instanceof SkillNotFoundError) {
    return false;
  }

  // Default: treat as permanent to avoid infinite retries
  return false;
};

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
): Effect.Effect<
  string,
  WorkflowError,
  GitHubService | ClassificationService | ReviewService | TeamsNotificationService
> =>
  Effect.gen(function* () {
    const github = yield* GitHubService;
    const classification = yield* ClassificationService;
    const review = yield* ReviewService;
    const teamsNotification = yield* TeamsNotificationService;

    // Add PR number to all logs in this workflow
    const logWithPR = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.annotateLogs("pr", prNumber));

    // Step 1: Swap labels - remove "ready-for-review", add "review-in-progress"
    // Retry on network failures - 5 retries with exponential backoff
    const networkRetrySchedule = Schedule.exponential(Duration.seconds(5)).pipe(
      Schedule.compose(Schedule.recurs(5))
    );

    yield* logWithPR(Effect.logInfo("Starting review - swapping labels"));
    yield* github.removeLabel(repo, prNumber, config.labels.readyForReview).pipe(
      Effect.retry({
        schedule: networkRetrySchedule,
        while: isTransientError,
      })
    );
    yield* github.addLabel(repo, prNumber, config.labels.reviewInProgress).pipe(
      Effect.retry({
        schedule: networkRetrySchedule,
        while: isTransientError,
      })
    );
    yield* logWithPR(Effect.logInfo(`Added ${config.labels.reviewInProgress} label`));

    // Step 2: Post initial "analyzing..." comment
    // Retry on network failures
    yield* logWithPR(Effect.logInfo("Posting initial comment"));
    const commentId = yield* github
      .postCommentWithId(
        repo,
        prNumber,
        "🤖 **review-rock is analyzing this PR...**\n\nGenerating review, please wait..."
      )
      .pipe(
        Effect.retry({
          schedule: networkRetrySchedule,
          while: isTransientError,
        })
      );
    yield* logWithPR(Effect.logInfo(`Posted comment #${commentId}`));

    // All subsequent steps run with error handling to reset labels on failure
    const reviewContent = yield* Effect.gen(function* () {
      // Step 3: Get PR details (just file list for classification)
      // Retry on network failures
      const details = yield* github.getPRDetails(repo, prNumber).pipe(
        Effect.retry({
          schedule: networkRetrySchedule,
          while: isTransientError,
        })
      );

      // Step 4: Classify the PR based on changed files
      const classificationResult = yield* classification.classifyPR(details.files);
      yield* logWithPR(Effect.logInfo(`Classified as: ${classificationResult.type}`));

      // Step 5: Select skill based on classification
      const skillName = selectSkillForClassification(classificationResult.type, config);
      yield* logWithPR(Effect.logInfo(`Using skill: ${skillName}`));

      // Step 6: Generate review using Claude's built-in /review command
      // Retry on transient failures (token expiry, network issues, etc.)
      // 10 retries with exponential backoff starting at 10 seconds
      const retrySchedule = Schedule.exponential(Duration.seconds(10)).pipe(
        Schedule.compose(Schedule.recurs(10))
      );

      const reviewContent = yield* review
        .generateReview(
          {
            repo,
            prNumber,
            diff: "", // Not needed - Claude /review fetches it
            details,
          },
          skillName
        )
        .pipe(
          Effect.retry({
            schedule: retrySchedule,
            while: (error) => {
              const shouldRetry = isTransientError(error);
              if (shouldRetry) {
                // Log that we're retrying due to transient error
                if (error instanceof AWSTokenExpiredError) {
                  Effect.logWarning(
                    "AWS token expired. Waiting for token refresh... (will retry automatically)"
                  )
                    .pipe(Effect.annotateLogs("pr", prNumber))
                    .pipe(Effect.runSync);
                } else {
                  Effect.logWarning(`Transient error: ${String(error)}. Retrying...`)
                    .pipe(Effect.annotateLogs("pr", prNumber))
                    .pipe(Effect.runSync);
                }
              }
              return shouldRetry;
            },
          })
        );

      // Step 7: Determine the appropriate label based on review content
      yield* logWithPR(Effect.logInfo("Determining review outcome label"));
      const labelDecision = determineReviewLabel(reviewContent);
      const finalLabel =
        labelDecision === "approved"
          ? config.labels.reviewApproved
          : config.labels.reviewRefactorRequired;
      yield* logWithPR(Effect.logInfo(`Review decision: ${labelDecision} -> ${finalLabel}`));

      // Step 8: Update the comment with the review content
      // Retry on network failures
      yield* logWithPR(Effect.logInfo(`Updating comment #${commentId} with review`));
      yield* github.updateComment(repo, commentId, reviewContent).pipe(
        Effect.retry({
          schedule: networkRetrySchedule,
          while: isTransientError,
        })
      );
      yield* logWithPR(Effect.logInfo(`Successfully updated comment #${commentId}`));

      // Step 8.5: Send Teams notification if enabled
      if (config.enableTeamsNotifications && config.teamsWebhookUrl) {
        yield* logWithPR(Effect.logInfo("Sending Teams notification"));

        // Build comment URL (GitHub comment URL format)
        const commentUrl = `${details.url}#issuecomment-${commentId}`;

        // Build notification data
        const notificationData = {
          ...buildReviewNotificationData(details, reviewContent, commentUrl),
          repository: repo,
        };

        // Send notification - catch errors to prevent workflow failure
        yield* teamsNotification
          .sendReviewNotification(config.teamsWebhookUrl, notificationData)
          .pipe(
            Effect.catchAll((error) =>
              logWithPR(
                Effect.logWarning(`Teams notification failed (non-critical): ${String(error)}`)
              ).pipe(Effect.as(undefined))
            )
          );
      } else {
        yield* logWithPR(
          Effect.logDebug("Teams notifications disabled or webhook URL not configured")
        );
      }

      // Step 9: Remove "review-in-progress" and add the final label
      // Retry on network failures
      yield* logWithPR(Effect.logInfo(`Removing ${config.labels.reviewInProgress} label`));
      yield* github.removeLabel(repo, prNumber, config.labels.reviewInProgress).pipe(
        Effect.retry({
          schedule: networkRetrySchedule,
          while: isTransientError,
        })
      );
      yield* logWithPR(Effect.logInfo(`Adding ${finalLabel} label`));
      yield* github.addLabel(repo, prNumber, finalLabel).pipe(
        Effect.retry({
          schedule: networkRetrySchedule,
          while: isTransientError,
        })
      );
      yield* logWithPR(Effect.logInfo("Review complete"));

      return reviewContent;
    }).pipe(
      // Reset labels if anything goes wrong (after all retries exhausted)
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          // Determine error type for better messaging
          const isTransient = isTransientError(error);
          const errorType = isTransient ? "transient error (retries exhausted)" : "permanent error";

          yield* logWithPR(Effect.logError(`${errorType}: ${String(error)}`));
          yield* logWithPR(Effect.logInfo("Updating comment with error message"));

          // Provide helpful error message based on error type
          let errorMessage = "❌ **review-rock encountered an error**\n\n";

          if (error instanceof AWSTokenExpiredError) {
            errorMessage +=
              "**Token Expired**: AWS SSO token has expired and was not refreshed within the retry period.\n\n";
            errorMessage += "**Action Required**: Run `aws sso login` to refresh your token.\n\n";
          } else if (isTransient) {
            errorMessage += `**Transient Error**: ${String(error)}\n\n`;
            errorMessage +=
              "This error persisted after multiple retries. It may resolve on its own.\n\n";
          } else {
            errorMessage += `**Error**: ${String(error)}\n\n`;
          }

          errorMessage += `The PR label has been reset to "${config.labels.readyForReview}" and will be retried automatically on the next poll.`;

          yield* github
            .updateComment(repo, commentId, errorMessage)
            .pipe(Effect.catchAll(() => Effect.void));

          // Reset labels: remove reviewInProgress, re-add readyForReview
          yield* logWithPR(Effect.logInfo("Resetting labels after error"));
          yield* github
            .removeLabel(repo, prNumber, config.labels.reviewInProgress)
            .pipe(Effect.catchAll(() => Effect.void));
          yield* github
            .addLabel(repo, prNumber, config.labels.readyForReview)
            .pipe(Effect.catchAll(() => Effect.void));

          // Re-throw the original error
          return yield* Effect.fail(error);
        })
      )
    );

    return reviewContent;
  });
