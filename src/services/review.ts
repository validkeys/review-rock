import { Context, Effect } from "effect";
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
