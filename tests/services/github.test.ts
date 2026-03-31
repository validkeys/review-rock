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
    it.todo("should get PR details successfully");
    it.todo("should return PRNotFoundError when PR does not exist");
    it.todo("should parse PR details correctly including files");
  });

  describe("getPRDiff", () => {
    it.todo("should get PR diff successfully");
    it.todo("should return GitHubCommandError when gh command fails");
    it.todo("should handle large diffs");
  });
});
