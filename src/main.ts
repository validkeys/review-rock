#!/usr/bin/env node
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
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
const ensureLabelExists = async (repo: string, label: string): Promise<void> => {
  try {
    console.log(`Ensuring label '${label}' exists in repository ${repo}...`);

    // Try to create the label
    // Using a purple color and descriptive text
    await execAsync(
      `gh label create "${label}" --repo "${repo}" --color "8B5CF6" --description "PR claimed by review-rock for automated review"`
    );

    console.log(`✓ Created label '${label}' in repository ${repo}`);
  } catch (error: any) {
    // Check if error is because label already exists
    if (error.message?.includes("already exists")) {
      console.log(`✓ Label '${label}' already exists in repository ${repo}`);
    } else {
      // Re-throw other errors
      console.error(`⚠️  Warning: Failed to create label '${label}':`, error.message);
      console.error("  The tool may not be able to claim PRs properly.");
      throw error;
    }
  }
};

/**
 * Main program execution
 * Loads config first, then sets up layers with the preloaded config
 */
const main = async () => {
  // Load configuration at startup
  const config = await loadConfig();
  console.log(`Loaded configuration for repository: ${config.repository}`);

  // Ensure the claim label exists in the repository
  await ensureLabelExists(config.repository, config.claimLabel);

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
  const run = cli(args).pipe(Effect.provide(MainLayer), Effect.provide(NodeContext.layer));

  // Run the program using NodeRuntime
  NodeRuntime.runMain(run);
};

// Start the program
main().catch((error) => {
  console.error("Fatal error during startup:");
  console.error(error.message);
  process.exit(1);
});
