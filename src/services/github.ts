import { Command, CommandExecutor } from "@effect/platform";
import { NodeCommandExecutor } from "@effect/platform-node";
import { NodeContext } from "@effect/platform-node";
import { Context, Effect, Layer, Schedule } from "effect";
import { GitHubCommandError, LabelClaimFailedError, PRNotFoundError } from "../errors/github.js";

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
   * Remove a label from a pull request
   * @param repo - Repository in format "owner/repo"
   * @param prNumber - Pull request number
   * @param label - Label to remove
   * @returns Effect that resolves to void or GitHubCommandError
   */
  readonly removeLabel: (
    repo: string,
    prNumber: number,
    label: string
  ) => Effect.Effect<void, GitHubCommandError>;

  /**
   * Post a comment on a pull request
   * @param repo - Repository in format "owner/repo"
   * @param prNumber - Pull request number
   * @param comment - Comment text to post
   * @returns Effect that resolves to void or GitHubCommandError
   */
  readonly postComment: (
    repo: string,
    prNumber: number,
    comment: string
  ) => Effect.Effect<void, GitHubCommandError>;

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
 * Helper to execute gh pr edit command to remove a label from a PR
 */
const executeRemoveLabelCommand = (
  repo: string,
  prNumber: number,
  label: string
): Effect.Effect<void, GitHubCommandError, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    // Execute gh pr edit command
    const command = Command.make(
      "gh",
      "pr",
      "edit",
      String(prNumber),
      "--repo",
      repo,
      "--remove-label",
      label
    );

    // Run command
    yield* Command.string(command).pipe(
      Effect.mapError(
        (error) =>
          new GitHubCommandError({
            command: "gh pr edit --remove-label",
            stderr: error.message || String(error),
            exitCode: 1,
          })
      )
    );
  });

/**
 * Helper to execute gh pr comment command to post a comment
 */
const executePostCommentCommand = (
  repo: string,
  prNumber: number,
  comment: string
): Effect.Effect<void, GitHubCommandError, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    // Execute gh pr comment command
    const command = Command.make(
      "gh",
      "pr",
      "comment",
      String(prNumber),
      "--repo",
      repo,
      "--body",
      comment
    );

    // Run command
    yield* Command.string(command).pipe(
      Effect.mapError(
        (error) =>
          new GitHubCommandError({
            command: "gh pr comment",
            stderr: error.message || String(error),
            exitCode: 1,
          })
      )
    );
  });

/**
 * Helper to parse file paths from gh JSON output
 */
const parseFiles = (files: unknown): ReadonlyArray<string> => {
  if (!Array.isArray(files)) return [];
  return files
    .filter(
      (file): file is { path: string } =>
        typeof file === "object" && file !== null && "path" in file
    )
    .map((file) => file.path);
};

/**
 * Helper to execute gh pr view command and get PR details
 */
const executeGetPRDetailsCommand = (
  repo: string,
  prNumber: number
): Effect.Effect<PRDetails, PRNotFoundError, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    // Execute gh pr view command
    const command = Command.make(
      "gh",
      "pr",
      "view",
      String(prNumber),
      "--repo",
      repo,
      "--json",
      "number,title,body,url,state,author,createdAt,updatedAt,labels,files"
    );

    // Run command and get output
    const commandResult = yield* Command.string(command).pipe(
      Effect.mapError((error) => {
        const errorMessage = error.message || String(error);
        // Check if the error is due to PR not found
        const isPRNotFound =
          errorMessage.toLowerCase().includes("not found") ||
          errorMessage.toLowerCase().includes("could not resolve");
        if (isPRNotFound) {
          return new PRNotFoundError({ prNumber });
        }
        // Otherwise, wrap in PRNotFoundError with the actual error message
        return new PRNotFoundError({ prNumber });
      })
    );

    // Parse JSON output
    const prDetails = yield* Effect.try({
      try: () => {
        const parsed = JSON.parse(commandResult) as {
          number: number;
          title: string;
          body: string;
          url: string;
          state: string;
          author: { login: string };
          createdAt: string;
          updatedAt: string;
          labels: unknown;
          files: unknown;
        };

        return {
          number: parsed.number,
          title: parsed.title,
          body: parsed.body,
          url: parsed.url,
          state: parsed.state,
          author: parsed.author.login,
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
          labels: parseLabels(parsed.labels),
          files: parseFiles(parsed.files),
        } satisfies PRDetails;
      },
      catch: () => new PRNotFoundError({ prNumber }),
    });

    return prDetails;
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
      removeLabel: (repo: string, prNumber: number, label: string) =>
        executeRemoveLabelCommand(repo, prNumber, label).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor)
        ),
      postComment: (repo: string, prNumber: number, comment: string) =>
        executePostCommentCommand(repo, prNumber, comment).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor)
        ),
      getPRDetails: (repo: string, prNumber: number) =>
        executeGetPRDetailsCommand(repo, prNumber).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor)
        ),
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
