import { Data } from "effect";

/**
 * Error thrown when a GitHub CLI command fails
 */
export class GitHubCommandError extends Data.TaggedError("GitHubCommandError")<{
  readonly command: string;
  readonly stderr: string;
  readonly exitCode: number;
}> {}

/**
 * Error thrown when a pull request is not found
 */
export class PRNotFoundError extends Data.TaggedError("PRNotFoundError")<{
  readonly prNumber: number;
}> {}

/**
 * Error thrown when claiming a PR with a label fails
 */
export class LabelClaimFailedError extends Data.TaggedError("LabelClaimFailedError")<{
  readonly prNumber: number;
  readonly reason: string;
}> {}
