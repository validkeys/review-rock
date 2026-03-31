import { Data } from "effect";

/**
 * Error thrown when AWS SSO token has expired
 */
export class AWSTokenExpiredError extends Data.TaggedError("AWSTokenExpiredError")<{
  readonly helpMessage: string;
}> {}

/**
 * Error thrown when a required skill is not found
 */
export class SkillNotFoundError extends Data.TaggedError("SkillNotFoundError")<{
  readonly skillName: string;
  readonly helpMessage: string;
}> {}

/**
 * Error thrown when claudecode CLI command fails
 */
export class ClaudeCodeCommandError extends Data.TaggedError("ClaudeCodeCommandError")<{
  readonly command: string;
  readonly stderr: string;
  readonly exitCode: number;
}> {}

/**
 * Error thrown when review generation fails for any reason
 */
export class ReviewGenerationError extends Data.TaggedError("ReviewGenerationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
