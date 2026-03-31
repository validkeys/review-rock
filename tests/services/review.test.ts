import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import type { ReviewService, PRContext } from "../../src/services/review.js";
import {
  buildClaudeCodeCommand,
  detectAWSTokenExpiry,
  detectSkillNotFound,
} from "../../src/services/review.js";
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

  // Tests for command builder (m3-002)
  describe("buildClaudeCodeCommand", () => {
    it("should build command array correctly", () => {
      const prContext: PRContext = {
        repo: "owner/repo",
        prNumber: 123,
        diff: "diff content",
        details: {
          number: 123,
          title: "Test PR",
          body: "PR description",
          url: "https://github.com/owner/repo/pull/123",
          state: "open",
          author: "testuser",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          labels: [],
          files: ["src/test.ts"],
        },
      };

      const result = buildClaudeCodeCommand(prContext, "test-skill");

      expect(result.command).toEqual(["claudecode", "skill", "test-skill"]);
      expect(result.input).toBeDefined();
    });

    it("should format PR context as markdown", () => {
      const prContext: PRContext = {
        repo: "owner/repo",
        prNumber: 456,
        diff: "diff --git a/file.ts\n+added line",
        details: {
          number: 456,
          title: "Add new feature",
          body: "Description",
          url: "https://github.com/owner/repo/pull/456",
          state: "open",
          author: "author",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          labels: ["enhancement"],
          files: ["src/feature.ts", "tests/feature.test.ts"],
        },
      };

      const result = buildClaudeCodeCommand(prContext, "review-skill");

      expect(result.input).toContain("# PR #456 Review Request");
      expect(result.input).toContain("**Repository:** owner/repo");
      expect(result.input).toContain("**PR Title:** Add new feature");
      expect(result.input).toContain("## Changed Files");
      expect(result.input).toContain("src/feature.ts");
      expect(result.input).toContain("tests/feature.test.ts");
      expect(result.input).toContain("## Diff");
      expect(result.input).toContain("diff --git a/file.ts");
    });

    it("should handle special characters in PR title", () => {
      const prContext: PRContext = {
        repo: "owner/repo",
        prNumber: 789,
        diff: "",
        details: {
          number: 789,
          title: "Fix: Handle `special` chars & symbols",
          body: "",
          url: "https://github.com/owner/repo/pull/789",
          state: "open",
          author: "user",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          labels: [],
          files: [],
        },
      };

      const result = buildClaudeCodeCommand(prContext, "test");

      expect(result.input).toContain("Fix: Handle `special` chars & symbols");
      expect(result.command).toEqual(["claudecode", "skill", "test"]);
    });
  });

  describe("detectAWSTokenExpiry", () => {
    it("should detect 'token has expired' message", () => {
      const stderr = "Error: AWS SSO token has expired. Please run 'aws sso login'";
      const result = detectAWSTokenExpiry(stderr);

      expect(result._tag).toBe("Some");
      if (result._tag === "Some") {
        expect(result.value._tag).toBe("AWSTokenExpiredError");
        expect(result.value.helpMessage).toContain("aws sso login");
      }
    });

    it("should detect 'credentials have expired' message", () => {
      const stderr = "Error: Your AWS credentials have expired";
      const result = detectAWSTokenExpiry(stderr);

      expect(result._tag).toBe("Some");
      if (result._tag === "Some") {
        expect(result.value._tag).toBe("AWSTokenExpiredError");
      }
    });

    it("should detect 'SSO session has expired' message", () => {
      const stderr = "SSO session has expired. Please re-authenticate.";
      const result = detectAWSTokenExpiry(stderr);

      expect(result._tag).toBe("Some");
    });

    it("should return None for non-token errors", () => {
      const stderr = "Error: Command not found";
      const result = detectAWSTokenExpiry(stderr);

      expect(result._tag).toBe("None");
    });

    it("should return None for empty stderr", () => {
      const result = detectAWSTokenExpiry("");

      expect(result._tag).toBe("None");
    });
  });

  describe("detectSkillNotFound", () => {
    it("should detect 'skill not found' message", () => {
      const stderr = "Error: skill not found";
      const result = detectSkillNotFound(stderr, "test-skill");

      expect(result._tag).toBe("Some");
      if (result._tag === "Some") {
        expect(result.value._tag).toBe("SkillNotFoundError");
        expect(result.value.skillName).toBe("test-skill");
        expect(result.value.helpMessage).toContain("claudecode skill add");
      }
    });

    it("should detect 'no such skill' message", () => {
      const stderr = "Error: no such skill available";
      const result = detectSkillNotFound(stderr, "review-skill");

      expect(result._tag).toBe("Some");
      if (result._tag === "Some") {
        expect(result.value.skillName).toBe("review-skill");
      }
    });

    it("should detect skill-specific error message", () => {
      const stderr = "Error: 'my-skill' does not exist";
      const result = detectSkillNotFound(stderr, "my-skill");

      expect(result._tag).toBe("Some");
    });

    it("should return None for non-skill errors", () => {
      const stderr = "Error: Network timeout";
      const result = detectSkillNotFound(stderr, "test-skill");

      expect(result._tag).toBe("None");
    });

    it("should return None for empty stderr", () => {
      const result = detectSkillNotFound("", "test-skill");

      expect(result._tag).toBe("None");
    });
  });

  describe("generateReview", () => {
    it.todo("should generate review successfully");
    it.todo("should detect AWS token expiry");
    it.todo("should detect skill not found");
    it.todo("should handle generic command errors");
    it.todo("should retry on transient failures");
  });
});
