import { Console, Context, Duration, Effect, Layer, Option, Schedule } from "effect";
import { ConfigService } from "./config.js";
import { GitHubService } from "./github.js";

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
 * Uses Effect.repeat with Schedule.spaced to poll GitHub at regular intervals
 * configured via ConfigService.
 */
export const PollingServiceLive = Layer.effect(
  PollingService,
  Effect.gen(function* () {
    const github = yield* GitHubService;
    const config = yield* ConfigService;

    return PollingService.of({
      startPolling: (repo: string) =>
        Effect.gen(function* () {
          // Get configuration
          const cfg = yield* config.getConfig;
          const { pollingIntervalMinutes, claimLabel } = cfg;

          // Define the poll-once effect
          const pollOnce = Effect.gen(function* () {
            yield* Console.log(
              `[PollingService] Polling ${repo} for unclaimed PRs (claim label: ${claimLabel})`
            );

            // Get all open PRs
            const prs = yield* github.listOpenPRs(repo);

            // Filter out PRs that already have the claim label
            const unclaimedPRs = prs.filter((pr) => !pr.labels.includes(claimLabel));

            yield* Console.log(
              `[PollingService] Found ${unclaimedPRs.length} unclaimed PRs out of ${prs.length} total`
            );

            // Return first unclaimed PR or None
            return unclaimedPRs.length > 0 ? Option.some(unclaimedPRs[0]) : Option.none();
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
