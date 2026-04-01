import { Context, Duration, Effect, Layer, Schedule } from "effect";
import type { Config } from "../config/schema.js";
import { processPR } from "../orchestration/workflow.js";
import { ClassificationService } from "./classification.js";
import { GitHubService } from "./github.js";
import { ReviewService } from "./review.js";

/**
 * PollingService provides periodic polling operations for GitHub repositories.
 *
 * The service uses Effect.repeat with Schedule.spaced to poll GitHub at
 * regular intervals, allowing the application to continuously check for
 * new pull requests that need review.
 *
 * The startPolling effect runs indefinitely and never completes successfully,
 * hence its return type of Effect<never, never, never>.
 */
export interface PollingService {
  /**
   * Start polling a GitHub repository for unclaimed pull requests
   *
   * This effect runs indefinitely, polling at the configured interval.
   * It will only terminate if an unrecoverable error occurs.
   *
   * @param repo - Repository in format "owner/repo"
   * @returns Effect that never succeeds (runs forever)
   */
  readonly startPolling: (repo: string) => Effect.Effect<never, never, never>;
}

/**
 * PollingService tag for dependency injection
 */
export const PollingService = Context.GenericTag<PollingService>("@services/PollingService");

/**
 * Live implementation of PollingService
 *
 * Uses Effect.repeat with Schedule.spaced to poll GitHub at regular intervals.
 * For each unclaimed PR, processes it through the complete review workflow.
 *
 * @param config - Preloaded configuration
 * @returns Layer that provides PollingService
 */
export const makePollingServiceLayer = (config: Config): Layer.Layer<
  PollingService,
  never,
  GitHubService | ClassificationService | ReviewService
> =>
  Layer.effect(
    PollingService,
    Effect.gen(function* () {
      const github = yield* GitHubService;
      const classification = yield* ClassificationService;
      const review = yield* ReviewService;

      return PollingService.of({
        startPolling: (repo: string) =>
          Effect.gen(function* () {
            // Use preloaded configuration
            const { pollingIntervalMinutes, labels } = config;

          // Define the poll-once effect
          const pollOnce = Effect.gen(function* () {
            yield* Effect.logInfo(
              `Polling ${repo} for PRs with label: ${labels.readyForReview}`
            );

            // Get all open PRs
            const prs = yield* github.listOpenPRs(repo);

            // Filter to only PRs that have the readyForReview label
            const readyPRs = prs.filter((pr) => pr.labels.includes(labels.readyForReview));

            yield* Effect.logInfo(
              `Found ${readyPRs.length} ready PRs out of ${prs.length} total`
            );

            // Process each ready PR through the workflow
            for (const pr of readyPRs) {
              yield* Effect.logInfo(`Processing PR #${pr.number}: ${pr.title}`).pipe(
                Effect.annotateLogs("pr", pr.number)
              );

              // Process PR with workflow - catch errors to prevent polling from stopping
              yield* processPR(repo, pr.number, config).pipe(
                Effect.provideService(GitHubService, github),
                Effect.provideService(ClassificationService, classification),
                Effect.provideService(ReviewService, review),
                Effect.tap((reviewContent) =>
                  Effect.logInfo(
                    `Successfully reviewed, review length: ${reviewContent.length} chars`
                  ).pipe(Effect.annotateLogs("pr", pr.number))
                ),
                Effect.catchAll((error) =>
                  Effect.logError(`Failed to process: ${String(error)}`).pipe(
                    Effect.annotateLogs("pr", pr.number),
                    Effect.as(undefined)
                  )
                )
              );
            }
          }).pipe(Effect.orDie);

          // Create schedule with configured interval
          const schedule = Schedule.spaced(Duration.minutes(pollingIntervalMinutes));

          // Repeat pollOnce indefinitely with the schedule
          yield* Effect.repeat(pollOnce, schedule);

          // This line is never reached (Effect<never>)
          return yield* Effect.never;
        }).pipe(Effect.orDie),
    });
  })
);
