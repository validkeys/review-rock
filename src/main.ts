#!/usr/bin/env node
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { reviewRockCommand } from "./cli/command.js";
import { makeClassificationServiceLayer } from "./services/classification.js";
import { loadConfig, makeRepositoryServiceLayer } from "./services/config.js";
import { GitHubServiceDefault } from "./services/github.js";
import { makePollingServiceLayer } from "./services/polling.js";
import { ReviewServiceLive } from "./services/review.js";
import { TeamsNotificationServiceLive } from "./services/teams-notification.js";

const execAsync = promisify(exec);

/**
 * Creates a single label in the repository
 * Handles "already exists" error gracefully
 */
const createLabel = (
  repo: string,
  label: string,
  color: string,
  description: string
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        execAsync(
          `gh label create "${label}" --repo "${repo}" --color "${color}" --description "${description}"`
        ),
      catch: (error) => error as Error,
    });

    yield* Effect.logInfo(`✓ Created label '${label}'`);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        // Check if error is because label already exists
        if (error.message?.includes("already exists")) {
          yield* Effect.logDebug(`Label '${label}' already exists`);
        } else {
          // Log warning but don't fail startup
          yield* Effect.logWarning(`Failed to create label '${label}': ${error.message}`);
          return yield* Effect.fail(error);
        }
      })
    )
  );

/**
 * Ensures all required workflow labels exist in the repository
 */
const ensureLabelsExist = (
  repo: string,
  labels: {
    readyForReview: string;
    reviewInProgress: string;
    reviewRefactorRequired: string;
    reviewApproved: string;
  }
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Ensuring workflow labels exist in repository ${repo}...`);

    // Create all labels in parallel
    yield* Effect.all(
      [
        createLabel(repo, labels.readyForReview, "0E8A16", "PR is ready for automated review"),
        createLabel(repo, labels.reviewInProgress, "FBCA04", "Review is currently in progress"),
        createLabel(
          repo,
          labels.reviewRefactorRequired,
          "D93F0B",
          "Review requires changes before approval"
        ),
        createLabel(repo, labels.reviewApproved, "0E8A16", "Review has been approved"),
      ],
      { concurrency: "unbounded" }
    );

    yield* Effect.logInfo("✓ All workflow labels are ready");
  });

/**
 * Main program execution
 * Loads config first, then sets up layers with the preloaded config
 */
const main = Effect.gen(function* () {
  // Load configuration at startup
  const config = yield* Effect.promise(() => loadConfig());
  yield* Effect.logInfo(`Loaded configuration for repository: ${config.repository}`);

  // Ensure all workflow labels exist in the repository
  yield* ensureLabelsExist(config.repository, config.labels);

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
    RepositoryServiceLive,
    TeamsNotificationServiceLive
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
const PrettyLoggerLayer = Logger.replace(Logger.defaultLogger, Logger.logfmtLogger).pipe(
  Layer.merge(Logger.minimumLogLevel(LogLevel.Info))
);

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
