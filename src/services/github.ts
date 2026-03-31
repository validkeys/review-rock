import { Command, CommandExecutor } from "@effect/platform";
import { NodeCommandExecutor } from "@effect/platform-node";
import { NodeContext } from "@effect/platform-node";
import { Context, Effect, Layer, Schedule } from "effect";
import {
  GitHubCommandError,
  LabelClaimFailedError,
  type PRNotFoundError,
} from "../errors/github.js";

/**
 * Represents a GitHub pull request
 */
export interface PR {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: string;
  readonly labels: ReadonlyArray<string>;
}

/**
 * Detailed information about a pull request
 */
export interface PRDetails {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly state: string;
  readonly author: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly labels: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
}

/**
 * GitHubService provides operations for interacting with GitHub repositories
 * using the GitHub CLI (gh).
 *
 * All operations use @effect/platform Command for subprocess execution
 * and return Effects with appropriate error types.
 */
export interface GitHubService {
  /**
   * List all open pull requests in a repository
   * @param repo - Repository in format "owner/repo"
   * @returns Effect that resolves to array of PRs or GitHubCommandError
   */
  readonly listOpenPRs: (repo: string) => Effect.Effect<ReadonlyArray<PR>, GitHubCommandError>;

  /**
   * Claim a pull request by adding a label
   * @param repo - Repository in format "owner/repo"
   * @param prNumber - Pull request number
   * @param label - Label to add for claiming the PR
   * @returns Effect that resolves to void or LabelClaimFailedError
   */
  readonly claimPR: (
    repo: string,
    prNumber: number,
    label: string
  ) => Effect.Effect<void, LabelClaimFailedError>;

  /**
   * Get detailed information about a pull request
   * @param repo - Repository in format "owner/repo"
   * @param prNumber - Pull request number
   * @returns Effect that resolves to PR details or PRNotFoundError
   */
  readonly getPRDetails: (
    repo: string,
    prNumber: number
  ) => Effect.Effect<PRDetails, PRNotFoundError>;

  /**
   * Get the diff for a pull request
   * @param repo - Repository in format "owner/repo"
   * @param prNumber - Pull request number
   * @returns Effect that resolves to diff string or GitHubCommandError
   */
  readonly getPRDiff: (repo: string, prNumber: number) => Effect.Effect<string, GitHubCommandError>;
}

/**
 * GitHubService tag for dependency injection
 */
export const GitHubService = Context.GenericTag<GitHubService>("@services/GitHubService");

/**
 * Helper to parse label data from gh JSON output
 */
const parseLabels = (labels: unknown): ReadonlyArray<string> => {
  if (!Array.isArray(labels)) return [];
  return labels
    .filter(
      (label): label is { name: string } =>
        typeof label === "object" && label !== null && "name" in label
    )
    .map((label) => label.name);
};

/**
 * Helper to execute gh command and parse PR list
 */
const executeListPRsCommand = (
  repo: string
): Effect.Effect<ReadonlyArray<PR>, GitHubCommandError, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    // Execute gh pr list command
    const command = Command.make(
      "gh",
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--json",
      "number,title,url,state,labels"
    );

    // Run command and get output
    const commandResult = yield* Command.string(command).pipe(
      Effect.mapError(
        (error) =>
          new GitHubCommandError({
            command: "gh pr list",
            stderr: error.message || String(error),
            exitCode: 1,
          })
      )
    );

    // Parse JSON output
    const prs = yield* Effect.try({
      try: () => {
        const parsed = JSON.parse(commandResult) as Array<{
          number: number;
          title: string;
          url: string;
          state: string;
          labels: unknown;
        }>;

        return parsed.map(
          (pr): PR => ({
            number: pr.number,
            title: pr.title,
            url: pr.url,
            state: pr.state,
            labels: parseLabels(pr.labels),
          })
        );
      },
      catch: (error) =>
        new GitHubCommandError({
          command: "gh pr list",
          stderr: `JSON parse error: ${error}`,
          exitCode: 0,
        }),
    });

    return prs;
  }).pipe(
    // Retry with exponential backoff for resilience
    Effect.retry(Schedule.exponential("1 second").pipe(Schedule.compose(Schedule.recurs(3))))
  );

/**
 * Helper to execute gh pr edit command to claim a PR with a label
 */
const executeClaimPRCommand = (
  repo: string,
  prNumber: number,
  label: string
): Effect.Effect<void, LabelClaimFailedError, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    // Execute gh pr edit command
    const command = Command.make(
      "gh",
      "pr",
      "edit",
      String(prNumber),
      "--repo",
      repo,
      "--add-label",
      label
    );

    // Run command
    yield* Command.string(command).pipe(
      Effect.mapError((error) => {
        const errorMessage = error.message || String(error);
        // Check if the error is due to label already existing
        const isLabelExists = errorMessage.toLowerCase().includes("already exists");
        return new LabelClaimFailedError({
          prNumber,
          reason: isLabelExists
            ? `Label '${label}' already exists on PR #${prNumber}`
            : errorMessage,
        });
      })
    );
  });

/**
 * Live implementation of GitHubService using GitHub CLI
 */
export const GitHubServiceLive = Layer.effect(
  GitHubService,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;
    return GitHubService.of({
      listOpenPRs: (repo: string) =>
        executeListPRsCommand(repo).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor)
        ),
      claimPR: (repo: string, prNumber: number, label: string) =>
        executeClaimPRCommand(repo, prNumber, label).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor)
        ),
      getPRDetails: () => Effect.dieMessage("Not implemented"),
      getPRDiff: () => Effect.dieMessage("Not implemented"),
    });
  })
);

/**
 * Default layer that provides GitHubServiceLive with NodeCommandExecutor
 */
export const GitHubServiceDefault = GitHubServiceLive.pipe(
  Layer.provide(NodeCommandExecutor.layer.pipe(Layer.provide(NodeContext.layer)))
);
