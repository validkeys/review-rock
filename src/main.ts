#!/usr/bin/env node
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { reviewRockCommand } from "./cli/command.js";
import { ClassificationServiceLive } from "./services/classification.js";
import { ConfigServiceLive } from "./services/config.js";
import { GitHubServiceDefault } from "./services/github.js";
import { PollingServiceLive } from "./services/polling.js";
import { ReviewServiceLive } from "./services/review.js";

/**
 * Main layer that provides all services for the application
 * Dependencies are resolved automatically: PollingServiceLive depends on the other services
 */
const MainLayer = PollingServiceLive.pipe(
  Layer.provide(ReviewServiceLive),
  Layer.provide(ClassificationServiceLive),
  Layer.provide(GitHubServiceDefault),
  Layer.provide(ConfigServiceLive)
);

/**
 * Main program execution
 */
const cli = Command.run(reviewRockCommand, {
  name: "Review Rock",
  version: "0.1.0",
});

// Get command line arguments
const args = process.argv.slice(2);

// Execute the CLI with arguments
const run = cli(args).pipe(
  // Provide all required services
  Effect.provide(MainLayer),
  // Provide Node context for platform operations
  Effect.provide(NodeContext.layer)
);

// Run the program using NodeRuntime
NodeRuntime.runMain(run);
