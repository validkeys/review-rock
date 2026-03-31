import { Command, CommandExecutor } from "@effect/platform";
import { NodeCommandExecutor, NodeContext } from "@effect/platform-node";
import { Context, Effect, Layer, Option, Stream } from "effect";
import {
  AWSTokenExpiredError,
  ClaudeCodeCommandError,
  ReviewGenerationError,
  SkillNotFoundError,
} from "../errors/review.js";
import type { PRDetails } from "./github.js";

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
 * Command and input for claude CLI execution
 */
interface ClaudeCodeCommand {
  readonly command: ReadonlyArray<string>;
  readonly input: string;
}

/**
 * Builds claude command array and formats PR review request
 * Uses Claude's built-in /review command which handles fetching the diff
 * @internal
 */
export const buildClaudeCodeCommand = (
  prContext: PRContext,
  skillName: string
): ClaudeCodeCommand => {
  // Use bare mode and pre-approve gh CLI commands for the /review command to work
  // The /review command needs gh to fetch PR details and diff
  const command = ["claude", "--bare", "--allowed-tools", "Bash(gh:*)"];

  // Build skill-specific guidance based on PR classification
  const skillGuidance = buildSkillGuidance(skillName);

  const input = `/review ${prContext.prNumber}

Repository: ${prContext.repo}
When using gh commands, always specify: --repo ${prContext.repo}

${skillGuidance}

# Review Guidelines

**Format:**
- Start with a brief summary (2-3 sentences max)
- List issues by severity: 🔴 Critical, 🟡 Warning, 🔵 Suggestion
- For each issue: show the problem code and fixed code side-by-side
- End with a clear verdict: Approve ✅ / Request Changes ❌ / Comment 💬

**Style:**
- Be concise - no fluff or verbose explanations
- Show examples with file:line references
- Skip minor style issues unless widespread`;

  return { command, input };
};

/**
 * Builds skill-specific guidance based on the classification
 * @internal
 */
const buildSkillGuidance = (skillName: string): string => {
  // Parse multiple skills if comma-separated (for mixed PRs)
  const skills = skillName.split(",").map((s) => s.trim());

  const guidanceMap: Record<string, string> = {
    "vercel-react-best-practices": `**Frontend Focus:**
- React/Next.js performance patterns
- Component composition and reusability
- Bundle optimization and code splitting
- Client/Server component boundaries`,

    "typescript-expert": `**Backend Focus:**
- TypeScript type safety and strict mode compliance
- Effect framework patterns and error handling
- API contract definitions with Zod
- Repository patterns and data access`,

    "vercel-react-native-skills": `**Mobile Focus:**
- React Native performance optimization
- Expo best practices
- Native module integration
- Mobile-specific patterns`,
  };

  // Build combined guidance for multiple skills
  const guidance = skills
    .map((skill) => guidanceMap[skill] || `**${skill}:** Apply relevant best practices`)
    .join("\n\n");

  return guidance || "**General:** Review for correctness, security, and maintainability";
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

/**
 * Helper to execute claude command and generate review
 */
const executeGenerateReviewCommand = (
  prContext: PRContext,
  skillName: string
): Effect.Effect<string, ReviewError, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    // Build command and input
    const { command, input } = buildClaudeCodeCommand(prContext, skillName);

    // Log command and input for debugging
    console.log(`\n=== Executing Review Command ===`);
    console.log(`Command: ${command.join(" ")}`);
    console.log(`Input length: ${input.length} characters`);
    console.log(`Input preview:\n${input.substring(0, 200)}...`);

    // Create command - Command.make expects the first arg to be the command
    // and the rest to be arguments
    const [cmd, ...args] = command;
    if (!cmd) {
      return yield* Effect.fail(
        new ReviewGenerationError({
          message: "Invalid command: command array is empty",
        })
      );
    }
    // Convert input string to Stream of Uint8Array for stdin
    const inputStream = Stream.make(new TextEncoder().encode(input));
    const claudeCommand = Command.make(cmd, ...args).pipe(Command.stdin(inputStream));

    // Execute command with stdin piped and capture stdout
    const result = yield* Command.string(claudeCommand).pipe(
      Effect.mapError((error) => {
        const errorMessage = error.message || String(error);

        // Check for AWS token expiry
        const tokenExpiry = detectAWSTokenExpiry(errorMessage);
        if (Option.isSome(tokenExpiry)) {
          return tokenExpiry.value;
        }

        // Check for skill not found
        const skillNotFound = detectSkillNotFound(errorMessage, skillName);
        if (Option.isSome(skillNotFound)) {
          return skillNotFound.value;
        }

        // Generic command error
        return new ClaudeCodeCommandError({
          command: command.join(" "),
          stderr: errorMessage,
          exitCode: 1,
        });
      })
    );

    // Log the result for debugging
    console.log(`\n=== Review Generated ===`);
    console.log(`Result length: ${result.length} characters`);
    console.log(`Result preview:\n${result.substring(0, 500)}...`);

    // Save to file for debugging
    const fs = yield* Effect.promise(() => import("fs/promises"));
    const logPath = `/tmp/review-rock-debug-${prContext.prNumber}.md`;
    yield* Effect.promise(() =>
      fs.writeFile(
        logPath,
        `# Review Debug Log\n\n## Command\n${command.join(" ")}\n\n## Input\n${input}\n\n## Output\n${result}`,
        "utf-8"
      )
    );
    console.log(`Debug log saved to: ${logPath}`);

    return result;
  });

/**
 * Live implementation of ReviewService using claudecode CLI
 */
export const ReviewServiceLive = Layer.effect(
  ReviewService,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;
    return ReviewService.of({
      generateReview: (prContext: PRContext, skillName: string) =>
        executeGenerateReviewCommand(prContext, skillName).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor)
        ),
    });
  })
);

/**
 * Default layer that provides ReviewServiceLive with NodeCommandExecutor
 */
export const ReviewServiceDefault = ReviewServiceLive.pipe(
  Layer.provide(NodeCommandExecutor.layer.pipe(Layer.provide(NodeContext.layer)))
);
