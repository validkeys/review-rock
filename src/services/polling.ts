import { Context, type Effect } from "effect";

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
