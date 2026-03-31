#!/usr/bin/env node
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer, Logger, LogLevel } from "effect";
import { reviewRockCommand } from "./cli/command.js";
import { makeClassificationServiceLayer } from "./services/classification.js";
import { loadConfig, makeRepositoryServiceLayer } from "./services/config.js";
import { GitHubServiceDefault } from "./services/github.js";
import { makePollingServiceLayer } from "./services/polling.js";
import { ReviewServiceLive } from "./services/review.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Ensures the claim label exists in the repository
 * Creates it if it doesn't exist, handles "already exists" error gracefully
 */
const ensureLabelExists = (
  repo: string,
  label: string
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    yield* Effect.log(`Ensuring label '${label}' exists in repository ${repo}...`);

    // Try to create the label using gh CLI
    yield* Effect.tryPromise({
      try: () =>
        execAsync(
          `gh label create "${label}" --repo "${repo}" --color "8B5CF6" --description "PR claimed by review-rock for automated review"`
        ),
      catch: (error) => error as Error,
    });

    yield* Effect.logInfo(`✓ Created label '${label}' in repository ${repo}`);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        // Check if error is because label already exists
        if (error.message?.includes("already exists")) {
          yield* Effect.logInfo(`✓ Label '${label}' already exists in repository ${repo}`);
        } else {
          // Log warning but don't fail startup
          yield* Effect.logWarning(
            `Failed to create label '${label}': ${error.message}. The tool may not be able to claim PRs properly.`
          );
          return yield* Effect.fail(error);
        }
      })
    )
  );

/**
 * Main program execution
 * Loads config first, then sets up layers with the preloaded config
 */
const main = Effect.gen(function* () {
  // Load configuration at startup
  const config = yield* Effect.promise(() => loadConfig());
  yield* Effect.logInfo(`Loaded configuration for repository: ${config.repository}`);

  // Ensure the claim label exists in the repository
  yield* ensureLabelExists(config.repository, config.claimLabel);

  // Create service layers with preloaded config
  const ClassificationServiceLive = makeClassificationServiceLayer(config);
  const PollingServiceLive = makePollingServiceLayer(config);
  const RepositoryServiceLive = makeRepositoryServiceLayer(config);

  /**
   * Main layer that provides all services for the application
   * PollingService depends on Review, Classification, and GitHub services
   * RepositoryService provides the configured repository to the CLI command
   * NodeContext is provided to all layers for command execution
   */
  const ApplicationServicesLayer = Layer.mergeAll(
    ReviewServiceLive,
    ClassificationServiceLive,
    GitHubServiceDefault,
    RepositoryServiceLive
  );

  /**
   * Final main layer with NodeContext provided to everything
   */
  const MainLayer = Layer.provideMerge(PollingServiceLive, ApplicationServicesLayer).pipe(
    Layer.provide(NodeContext.layer)
  );

  /**
   * CLI setup
   */
  const cli = Command.run(reviewRockCommand, {
    name: "Review Rock",
    version: "0.1.0",
  });

  // No command line arguments needed - everything from config
  const args = process.argv.slice(2);

  // Execute the CLI with arguments, provide layers and run
  return yield* cli(args).pipe(Effect.provide(MainLayer), Effect.provide(NodeContext.layer));
});

/**
 * Pretty logger layer for colorized console output with minimum level Info
 */
const PrettyLoggerLayer = Logger.replace(
  Logger.defaultLogger,
  Logger.logfmtLogger
).pipe(Layer.merge(Logger.minimumLogLevel(LogLevel.Info)));

// Start the program with pretty logging
NodeRuntime.runMain(
  main.pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logError(`Fatal error during startup: ${error}`);
        return yield* Effect.fail(error);
      })
    ),
    Effect.provide(PrettyLoggerLayer)
  )
);
