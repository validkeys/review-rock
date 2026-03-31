import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import type { ReviewService, PRContext } from "../../src/services/review.js";
import {
  AWSTokenExpiredError,
  ClaudeCodeCommandError,
  ReviewGenerationError,
  SkillNotFoundError,
} from "../../src/errors/review.js";

describe("ReviewService", () => {
  describe("interface and error types", () => {
    it("should compile error types correctly", () => {
      const tokenError = new AWSTokenExpiredError({
        helpMessage: "Run 'aws sso login' to refresh",
      });
      expect(tokenError._tag).toBe("AWSTokenExpiredError");
      expect(tokenError.helpMessage).toBe("Run 'aws sso login' to refresh");

      const skillError = new SkillNotFoundError({
        skillName: "test-skill",
        helpMessage: "Install with: claudecode skill add <url>",
      });
      expect(skillError._tag).toBe("SkillNotFoundError");
      expect(skillError.skillName).toBe("test-skill");

      const commandError = new ClaudeCodeCommandError({
        command: "claudecode skill test",
        stderr: "error output",
        exitCode: 1,
      });
      expect(commandError._tag).toBe("ClaudeCodeCommandError");
      expect(commandError.exitCode).toBe(1);

      const reviewError = new ReviewGenerationError({
        message: "Failed to generate review",
        cause: new Error("underlying error"),
      });
      expect(reviewError._tag).toBe("ReviewGenerationError");
      expect(reviewError.message).toBe("Failed to generate review");
    });
  });

  // Placeholder tests for upcoming tasks
  describe("buildClaudeCodeCommand", () => {
    it.todo("should build command array correctly");
    it.todo("should format PR context as markdown");
    it.todo("should handle special characters in PR title");
  });

  describe("detectAWSTokenExpiry", () => {
    it.todo("should detect 'token has expired' message");
    it.todo("should detect 'credentials have expired' message");
    it.todo("should return None for non-token errors");
  });

  describe("detectSkillNotFound", () => {
    it.todo("should detect 'skill not found' message");
    it.todo("should detect skill-specific errors");
    it.todo("should return None for non-skill errors");
  });

  describe("generateReview", () => {
    it.todo("should generate review successfully");
    it.todo("should detect AWS token expiry");
    it.todo("should detect skill not found");
    it.todo("should handle generic command errors");
    it.todo("should retry on transient failures");
  });
});
