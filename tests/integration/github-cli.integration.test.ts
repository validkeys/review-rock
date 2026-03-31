/**
 * Integration tests for GitHubService with real gh CLI
 *
 * These tests verify that GitHubService works correctly with the actual gh CLI.
 * They are skipped if:
 * - GH_TOKEN environment variable is not set
 * - gh command is not available
 *
 * Prerequisites:
 * - gh CLI installed: https://cli.github.com/
 * - Authenticated: gh auth login
 * - Or set GH_TOKEN environment variable
 *
 * These tests use the public repository "cli/cli" for read-only operations.
 * No write operations are performed to avoid requiring repository access.
 */

import { it, describe, beforeAll } from "vitest";
import { Effect, Layer } from "effect";
import { NodeCommandExecutor } from "@effect/platform-node";
import { GitHubService } from "../../src/services/github.js";
import { ConfigService } from "../../src/services/config.js";

// Check if gh CLI is available and authenticated
const hasGhCLI = async (): Promise<boolean> => {
  try {
    const { execSync } = await import("node:child_process");
    execSync("gh --version", { stdio: "ignore" });
    // Check if authenticated
    execSync("gh auth status", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

// Test configuration using a public repository
const testConfig = {
  repository: "cli/cli", // GitHub's CLI repository (public, active)
  claimLabel: "review-rock-claimed-test",
  pollIntervalSeconds: 60,
  claudeCodePath: "claudecode",
  claudeCodeSkill: "@validkeys/review-pull-request",
};

// Create test layers
const TestConfigLayer = Layer.succeed(
  ConfigService,
  ConfigService.of({
    getConfig: () => Effect.succeed(testConfig),
  })
);

const MainLayer = Layer.mergeAll(
  TestConfigLayer,
  NodeCommandExecutor.layer
).pipe(Layer.provide(GitHubService.Default));

describe("GitHubService Integration with gh CLI", () => {
  let skipTests = false;

  beforeAll(async () => {
    skipTests = !(await hasGhCLI());
    if (skipTests) {
      console.log("⚠️  Skipping gh CLI integration tests: gh not authenticated");
      console.log("   Run: gh auth login");
    }
  });

  it.skipIf(() => skipTests)(
    "should list open PRs from public repository",
    async () => {
      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        const prs = yield* github.listOpenPRs();

        // The cli/cli repo should have at least some PRs (it's an active project)
        // We're not asserting a specific number since it varies
        return { count: prs.length, sample: prs[0] };
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MainLayer)));

      // Basic assertions
      console.log(`Found ${result.count} open PRs`);
      if (result.sample) {
        console.log(`Sample PR: #${result.sample.number} - ${result.sample.title}`);
      }

      // The repo should have a number and title
      if (result.sample) {
        expect(result.sample.number).toBeGreaterThan(0);
        expect(result.sample.title).toBeTruthy();
      }
    }
  );

  it.skipIf(() => skipTests)(
    "should get PR details for a specific PR",
    async () => {
      const program = Effect.gen(function* () {
        const github = yield* GitHubService;

        // First get any open PR
        const prs = yield* github.listOpenPRs();
        if (prs.length === 0) {
          return { skipped: true, reason: "No open PRs available" };
        }

        const firstPR = prs[0];
        const details = yield* github.getPRDetails(firstPR.number);

        return { skipped: false, details, originalPR: firstPR };
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MainLayer)));

      if (result.skipped) {
        console.log(`⚠️  ${result.reason}`);
        return;
      }

      // Verify details match the PR we fetched
      expect(result.details.number).toBe(result.originalPR.number);
      expect(result.details.title).toBe(result.originalPR.title);
      expect(result.details.body).toBeTruthy();
      expect(result.details.author).toBeTruthy();

      console.log(`✓ PR #${result.details.number}: ${result.details.title}`);
      console.log(`  Author: ${result.details.author}`);
    }
  );

  it.skipIf(() => skipTests)("should get PR diff for a specific PR", async () => {
    const program = Effect.gen(function* () {
      const github = yield* GitHubService;

      // First get any open PR
      const prs = yield* github.listOpenPRs();
      if (prs.length === 0) {
        return { skipped: true, reason: "No open PRs available" };
      }

      const firstPR = prs[0];
      const diff = yield* github.getPRDiff(firstPR.number);

      return { skipped: false, diff, prNumber: firstPR.number };
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(MainLayer)));

    if (result.skipped) {
      console.log(`⚠️  ${result.reason}`);
      return;
    }

    // Verify diff content looks like a diff
    expect(result.diff).toBeTruthy();
    expect(result.diff.length).toBeGreaterThan(0);

    // Diffs typically contain diff markers
    const hasDiffMarkers =
      result.diff.includes("diff --git") ||
      result.diff.includes("+++") ||
      result.diff.includes("---") ||
      result.diff.includes("@@");

    expect(hasDiffMarkers).toBe(true);

    console.log(`✓ PR #${result.prNumber} diff: ${result.diff.length} characters`);
  });
});
