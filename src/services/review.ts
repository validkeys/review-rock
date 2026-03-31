import { Context, Effect, Option } from "effect";
import type { PRDetails } from "./github.js";
import {
  AWSTokenExpiredError,
  ClaudeCodeCommandError,
  ReviewGenerationError,
  SkillNotFoundError,
} from "../errors/review.js";

/**
 * Context information for a pull request review
 */
export interface PRContext {
  readonly repo: string;
  readonly prNumber: number;
  readonly diff: string;
  readonly details: PRDetails;
}

/**
 * Union type of all possible review errors
 */
export type ReviewError =
  | ReviewGenerationError
  | AWSTokenExpiredError
  | SkillNotFoundError
  | ClaudeCodeCommandError;

/**
 * ReviewService provides operations for generating PR reviews using Claude Code
 *
 * The service shells out to the claudecode CLI to execute review skills,
 * handles error detection (token expiry, skill not found), and captures
 * review output for posting to GitHub.
 */
export interface ReviewService {
  /**
   * Generate a review for a pull request using a specified skill
   * @param prContext - Full context about the PR including diff and details
   * @param skillName - Name of the claudecode skill to execute
   * @returns Effect that resolves to review content string or ReviewError
   */
  readonly generateReview: (
    prContext: PRContext,
    skillName: string
  ) => Effect.Effect<string, ReviewError>;
}

/**
 * ReviewService tag for dependency injection
 */
export const ReviewService = Context.GenericTag<ReviewService>("@services/ReviewService");

/**
 * Command and input for claudecode CLI execution
 */
interface ClaudeCodeCommand {
  readonly command: ReadonlyArray<string>;
  readonly input: string;
}

/**
 * Builds claudecode command array and formats PR context as markdown
 * @internal
 */
export const buildClaudeCodeCommand = (
  prContext: PRContext,
  skillName: string
): ClaudeCodeCommand => {
  const command = ["claudecode", "skill", skillName];

  const input = `# PR #${prContext.prNumber} Review Request

**Repository:** ${prContext.repo}
**PR Title:** ${prContext.details.title}

## Changed Files
${prContext.details.files.join("\n")}

## Diff
${prContext.diff}`;

  return { command, input };
};

/**
 * Token expiry error patterns to detect in stderr
 * Extensible list of patterns that indicate AWS SSO token expiry
 * All patterns are lowercase for case-insensitive matching
 */
const TOKEN_EXPIRY_PATTERNS = [
  "token has expired",
  "credentials have expired",
  "sso session has expired",
] as const;

/**
 * Detects AWS SSO token expiry from claudecode stderr output
 * @internal
 */
export const detectAWSTokenExpiry = (stderr: string): Option.Option<AWSTokenExpiredError> => {
  const lowerStderr = stderr.toLowerCase();
  const hasTokenExpiry = TOKEN_EXPIRY_PATTERNS.some((pattern) => lowerStderr.includes(pattern));

  if (hasTokenExpiry) {
    return Option.some(
      new AWSTokenExpiredError({
        helpMessage: "AWS SSO token expired. Run 'aws sso login' to refresh.",
      })
    );
  }

  return Option.none();
};

/**
 * Skill not found error patterns to detect in stderr
 * Extensible list of patterns that indicate the skill doesn't exist
 * All patterns are lowercase for case-insensitive matching
 */
const SKILL_NOT_FOUND_PATTERNS = ["skill not found", "no such skill", "does not exist"] as const;

/**
 * Detects skill not found errors from claudecode stderr output
 * @internal
 */
export const detectSkillNotFound = (
  stderr: string,
  skillName: string
): Option.Option<SkillNotFoundError> => {
  const lowerStderr = stderr.toLowerCase();
  const hasSkillNotFound = SKILL_NOT_FOUND_PATTERNS.some((pattern) =>
    lowerStderr.includes(pattern)
  );

  if (hasSkillNotFound) {
    return Option.some(
      new SkillNotFoundError({
        skillName,
        helpMessage: `Skill '${skillName}' not found. Install with: claudecode skill add <skill-url>`,
      })
    );
  }

  return Option.none();
};
