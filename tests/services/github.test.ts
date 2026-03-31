import { describe, it } from "vitest";

describe("GitHubService", () => {
  describe("listOpenPRs", () => {
    it.todo("should list all open pull requests");
    it.todo("should return GitHubCommandError when gh command fails");
    it.todo("should parse PR data correctly");
  });

  describe("claimPR", () => {
    it("should add label to PR successfully", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");

      // Mock CommandExecutor that simulates successful label addition
      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.succeed({
            exitCode: Effect.succeed(0),
            stdout: Effect.succeed(""),
            stderr: Effect.succeed(""),
          } as never),
        string: (_command: never) => Effect.succeed(""),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        yield* github.claimPR("owner/repo", 123, "claimed");
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
      expect(result).toBeUndefined();
    });

    it("should return LabelClaimFailedError when label already exists", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer, Exit } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");
      const { LabelClaimFailedError } = await import("../../src/errors/github.js");

      // Mock CommandExecutor that directly fails with error message
      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.fail({
            message: "label 'claimed' already exists on issue",
          } as never),
        string: (_command: never) =>
          Effect.fail({
            message: "label 'claimed' already exists on issue",
          } as never),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        yield* github.claimPR("owner/repo", 123, "claimed");
      });

      const result = await Effect.runPromiseExit(program.pipe(Effect.provide(TestLayer)));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          const error = result.cause.error;
          expect(error).toBeInstanceOf(LabelClaimFailedError);
          expect(error.prNumber).toBe(123);
          expect(error.reason).toContain("already exists");
        }
      }
    });

    it("should return LabelClaimFailedError on command failure", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer, Exit } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");
      const { LabelClaimFailedError } = await import("../../src/errors/github.js");

      // Mock CommandExecutor that directly fails with error message
      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.fail({
            message: "network error: unable to reach GitHub API",
          } as never),
        string: (_command: never) =>
          Effect.fail({
            message: "network error: unable to reach GitHub API",
          } as never),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        yield* github.claimPR("owner/repo", 456, "reviewing");
      });

      const result = await Effect.runPromiseExit(program.pipe(Effect.provide(TestLayer)));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          const error = result.cause.error;
          expect(error).toBeInstanceOf(LabelClaimFailedError);
          expect(error.prNumber).toBe(456);
        }
      }
    });
  });

  describe("getPRDetails", () => {
    it("should get PR details successfully", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");

      const mockResponse = JSON.stringify({
        number: 123,
        title: "Add new feature",
        body: "This is a test PR",
        url: "https://github.com/owner/repo/pull/123",
        state: "OPEN",
        author: { login: "testuser" },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        labels: [{ name: "feature" }, { name: "urgent" }],
        files: [{ path: "src/file1.ts" }, { path: "src/file2.ts" }],
      });

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.succeed({
            exitCode: Effect.succeed(0),
            stdout: Effect.succeed(mockResponse),
            stderr: Effect.succeed(""),
          } as never),
        string: (_command: never) => Effect.succeed(mockResponse),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        return yield* github.getPRDetails("owner/repo", 123);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
      expect(result).toEqual({
        number: 123,
        title: "Add new feature",
        body: "This is a test PR",
        url: "https://github.com/owner/repo/pull/123",
        state: "OPEN",
        author: "testuser",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        labels: ["feature", "urgent"],
        files: ["src/file1.ts", "src/file2.ts"],
      });
    });

    it("should return PRNotFoundError when PR does not exist", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer, Exit } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");
      const { PRNotFoundError } = await import("../../src/errors/github.js");

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.fail({
            message: "pull request not found",
          } as never),
        string: (_command: never) =>
          Effect.fail({
            message: "pull request not found",
          } as never),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        return yield* github.getPRDetails("owner/repo", 999);
      });

      const result = await Effect.runPromiseExit(program.pipe(Effect.provide(TestLayer)));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          const error = result.cause.error;
          expect(error).toBeInstanceOf(PRNotFoundError);
          expect(error.prNumber).toBe(999);
        }
      }
    });

    it("should parse PR details correctly including files", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");

      const mockResponse = JSON.stringify({
        number: 456,
        title: "Fix bug",
        body: "",
        url: "https://github.com/owner/repo/pull/456",
        state: "CLOSED",
        author: { login: "anotheruser" },
        createdAt: "2024-02-01T00:00:00Z",
        updatedAt: "2024-02-03T00:00:00Z",
        labels: [],
        files: [{ path: "README.md" }, { path: "src/index.ts" }, { path: "tests/unit.test.ts" }],
      });

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.succeed({
            exitCode: Effect.succeed(0),
            stdout: Effect.succeed(mockResponse),
            stderr: Effect.succeed(""),
          } as never),
        string: (_command: never) => Effect.succeed(mockResponse),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        return yield* github.getPRDetails("owner/repo", 456);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
      expect(result.number).toBe(456);
      expect(result.title).toBe("Fix bug");
      expect(result.body).toBe("");
      expect(result.author).toBe("anotheruser");
      expect(result.labels).toEqual([]);
      expect(result.files).toEqual(["README.md", "src/index.ts", "tests/unit.test.ts"]);
    });
  });

  describe("getPRDiff", () => {
    it.todo("should get PR diff successfully");
    it.todo("should return GitHubCommandError when gh command fails");
    it.todo("should handle large diffs");
  });

  describe("removeLabel", () => {
    it("should remove label from PR successfully", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.succeed({
            exitCode: Effect.succeed(0),
            stdout: Effect.succeed(""),
            stderr: Effect.succeed(""),
          } as never),
        string: (_command: never) => Effect.succeed(""),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        return yield* github.removeLabel("owner/repo", 123, "reviewing");
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
      // If we reach here, the operation succeeded
      expect(true).toBe(true);
    });

    it("should return GitHubCommandError when gh command fails", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer, Exit } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");
      const { GitHubCommandError } = await import("../../src/errors/github.js");

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.fail({
            message: "label not found",
          } as never),
        string: (_command: never) =>
          Effect.fail({
            message: "label not found",
          } as never),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        return yield* github.removeLabel("owner/repo", 123, "reviewing");
      });

      const result = await Effect.runPromiseExit(program.pipe(Effect.provide(TestLayer)));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          const error = result.cause.error;
          expect(error).toBeInstanceOf(GitHubCommandError);
        }
      }
    });
  });

  describe("postComment", () => {
    it("should post comment to PR successfully", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.succeed({
            exitCode: Effect.succeed(0),
            stdout: Effect.succeed(""),
            stderr: Effect.succeed(""),
          } as never),
        string: (_command: never) => Effect.succeed(""),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        return yield* github.postComment("owner/repo", 123, "Great work on this PR!");
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
      // If we reach here, the operation succeeded
      expect(true).toBe(true);
    });

    it("should handle special characters in comment", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.succeed({
            exitCode: Effect.succeed(0),
            stdout: Effect.succeed(""),
            stderr: Effect.succeed(""),
          } as never),
        string: (_command: never) => Effect.succeed(""),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        const commentWithSpecialChars = "Review comment with \"quotes\" and 'apostrophes'";
        return yield* github.postComment("owner/repo", 123, commentWithSpecialChars);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
      // If we reach here, the operation succeeded
      expect(true).toBe(true);
    });

    it("should return GitHubCommandError when gh command fails", async ({ expect }) => {
      const { CommandExecutor } = await import("@effect/platform");
      const { Effect, Layer, Exit } = await import("effect");
      const { GitHubService, GitHubServiceLive } = await import("../../src/services/github.js");
      const { GitHubCommandError } = await import("../../src/errors/github.js");

      const mockCommandExecutor = Layer.succeed(CommandExecutor.CommandExecutor, {
        start: (_command: never) =>
          Effect.fail({
            message: "PR not found",
          } as never),
        string: (_command: never) =>
          Effect.fail({
            message: "PR not found",
          } as never),
      } as never);

      const TestLayer = GitHubServiceLive.pipe(Layer.provide(mockCommandExecutor));

      const program = Effect.gen(function* () {
        const github = yield* GitHubService;
        return yield* github.postComment("owner/repo", 999, "This should fail");
      });

      const result = await Effect.runPromiseExit(program.pipe(Effect.provide(TestLayer)));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          const error = result.cause.error;
          expect(error).toBeInstanceOf(GitHubCommandError);
        }
      }
    });
  });
});
