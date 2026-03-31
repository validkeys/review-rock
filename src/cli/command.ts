import { Args, Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { PollingService } from "../services/polling.js";

/**
 * Repository argument for specifying the GitHub repository to review.
 * Format: "owner/repo" (e.g., "validkeys/lumen")
 */
const repositoryArg = Args.text({ name: "repository" });

/**
 * Optional config file path for custom configuration.
 */
const configOption = Options.file("config").pipe(Options.optional);

/**
 * Optional polling interval in seconds.
 * How often to check for new PRs that need review.
 */
const pollingIntervalOption = Options.integer("polling-interval").pipe(Options.optional);

/**
 * Main CLI command for review-rock.
 * Automated PR review using Claude via claudecode CLI.
 *
 * Usage:
 *   review-rock <repository>
 *   review-rock validkeys/lumen --config ./custom-config.yaml
 *   review-rock validkeys/lumen --polling-interval 300
 */
export const reviewRockCommand = Command.make(
  "review-rock",
  {
    repository: repositoryArg,
    config: configOption,
    pollingInterval: pollingIntervalOption,
  },
  ({ repository }) =>
    Effect.gen(function* () {
      yield* Console.log(`[review-rock] Starting review automation for ${repository}`);

      const polling = yield* PollingService;

      // Start polling - this runs indefinitely
      yield* polling.startPolling(repository);
    })
).pipe(
  Command.withDescription(
    "Automated PR review using Claude via claudecode CLI with distributed coordination"
  )
);
