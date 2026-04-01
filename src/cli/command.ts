import { Command } from "@effect/cli";
import { Effect } from "effect";
import { RepositoryService } from "../services/config.js";
import { PollingService } from "../services/polling.js";

/**
 * Main CLI command for review-rock.
 * Automated PR review using Claude via claudecode CLI.
 *
 * Configuration is loaded from review-rock.config.ts in the current directory.
 * No arguments are required - everything is configured via the config file.
 */
export const reviewRockCommand = Command.make("review-rock", {}, () =>
  Effect.gen(function* () {
    // Get repository from RepositoryService
    const repoService = yield* RepositoryService;
    const repo = yield* repoService.getRepository;

    yield* Effect.logInfo(`Starting review automation for ${repo}`);

    const polling = yield* PollingService;

    // Start polling - this runs indefinitely
    yield* polling.startPolling(repo);
  })
).pipe(
  Command.withDescription(
    "Automated PR review using Claude via claudecode CLI with distributed coordination"
  )
);
