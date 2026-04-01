import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config/schema.js";
import { ReviewGenerationError } from "../../src/errors/review.js";
import { processPR } from "../../src/orchestration/workflow.js";
import { ClassificationService } from "../../src/services/classification.js";
import type { PRDetails } from "../../src/services/github.js";
import { GitHubService } from "../../src/services/github.js";
import { ReviewService } from "../../src/services/review.js";

// Mock implementations for testing
const mockPRDetails: PRDetails = {
  number: 123,
  title: "Add new feature",
  body: "This PR adds a new feature",
  url: "https://github.com/owner/repo/pull/123",
  state: "open",
  author: "testuser",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  labels: ["needs-review"],
  files: ["apps/react-webapp/src/components/Button.tsx"],
};

const mockDiff = `diff --git a/apps/react-webapp/src/components/Button.tsx b/apps/react-webapp/src/components/Button.tsx
+++ b/apps/react-webapp/src/components/Button.tsx
@@ -1,3 +1,4 @@
+export const Button = () => <button>Click me</button>;`;

const testConfig: Config = {
  repository: "owner/repo",
  pollingIntervalMinutes: 5,
  labels: {
    readyForReview: "ready-for-review",
    reviewInProgress: "review-in-progress",
    reviewRefactorRequired: "review-refactor-required",
    reviewApproved: "review-approved",
  },
  frontendPaths: ["apps/react-webapp"],
  skills: {
    frontend: "frontend-skill",
    backend: "backend-skill",
    mixed: "mixed-skill",
  },
};

describe("Workflow Orchestration", () => {
  describe("processPR", () => {
    it("should successfully process a PR through complete workflow", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;

        const result = yield* processPR(repo, prNumber, testConfig);

        expect(result).toContain("frontend");
        expect(result.length).toBeGreaterThan(0);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            // Mock GitHubService
            Layer.succeed(GitHubService, {
              listOpenPRs: () => Effect.succeed([]),
              claimPR: () => Effect.void,
              getPRDetails: () => Effect.succeed(mockPRDetails),
              getPRDiff: () => Effect.succeed(mockDiff),
              removeLabel: () => Effect.void,
              addLabel: () => Effect.void,
              postCommentWithId: () => Effect.succeed("comment-id-123"),
              updateComment: () => Effect.void,
            }),
            // Mock ClassificationService
            Layer.succeed(ClassificationService, {
              classifyPR: () =>
                Effect.succeed({
                  type: "frontend" as const,
                  matchedPaths: ["apps/react-webapp/src/components/Button.tsx"],
                }),
            }),
            // Mock ReviewService
            Layer.succeed(ReviewService, {
              generateReview: () => Effect.succeed("Mock review: frontend changes look good"),
            })
          )
        ),
        Effect.runPromise
      ));

    it("should swap labels at workflow start", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;

        let readyForReviewRemoved = false;
        let reviewInProgressAdded = false;

        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: (_r, _p, label) =>
            Effect.gen(function* () {
              if (label === "ready-for-review") readyForReviewRemoved = true;
              yield* Effect.void;
            }),
          addLabel: (_r, _p, label) =>
            Effect.gen(function* () {
              if (label === "review-in-progress") reviewInProgressAdded = true;
              yield* Effect.void;
            }),
          postCommentWithId: () => Effect.succeed("comment-id-123"),
          updateComment: () => Effect.void,
        });

        yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, mockGitHubService),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "frontend" as const,
                    matchedPaths: ["apps/react-webapp/src/components/Button.tsx"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed("Mock review"),
              })
            )
          )
        );

        expect(readyForReviewRemoved).toBe(true);
        expect(reviewInProgressAdded).toBe(true);
      }).pipe(Effect.runPromise));

    it("should reset labels if classification fails after label swap", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;

        let labelSwapCompleted = false;
        let labelResetAttempted = false;

        const gitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: (_, __, label) =>
            Effect.gen(function* () {
              if (label === "review-in-progress") {
                labelResetAttempted = true;
              }
              yield* Effect.void;
            }),
          addLabel: (_, __, label) =>
            Effect.gen(function* () {
              if (label === "review-in-progress") {
                labelSwapCompleted = true;
              }
              yield* Effect.void;
            }),
          postCommentWithId: () => Effect.succeed("comment-id-123"),
          updateComment: () => Effect.void,
        });

        const classificationService = ClassificationService.of({
          classifyPR: () => Effect.fail(new Error("Classification failed")),
        });

        const reviewService = ReviewService.of({
          generateReview: () => Effect.succeed("Mock review"),
        });

        yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, gitHubService),
              Layer.succeed(ClassificationService, classificationService),
              Layer.succeed(ReviewService, reviewService)
            )
          ),
          Effect.catchAll(() => Effect.void) // Ignore the error
        );

        expect(labelSwapCompleted).toBe(true);
        expect(labelResetAttempted).toBe(true);
      }).pipe(Effect.runPromise));

    it("should reset labels if review generation fails after label swap", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;

        let labelSwapCompleted = false;
        let labelResetAttempted = false;

        const gitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: (_, __, label) =>
            Effect.gen(function* () {
              if (label === "review-in-progress") {
                labelResetAttempted = true;
              }
              yield* Effect.void;
            }),
          addLabel: (_, __, label) =>
            Effect.gen(function* () {
              if (label === "review-in-progress") {
                labelSwapCompleted = true;
              }
              yield* Effect.void;
            }),
          postCommentWithId: () => Effect.succeed("comment-id-123"),
          updateComment: () => Effect.void,
        });

        const classificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              type: "frontend" as const,
              matchedPaths: ["apps/react-webapp/src/components/Button.tsx"],
            }),
        });

        const reviewService = ReviewService.of({
          generateReview: () =>
            Effect.fail(new ReviewGenerationError("Review generation failed", "timeout")),
        });

        yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(Layer.succeed(GitHubService, gitHubService)),
          Effect.provide(Layer.succeed(ClassificationService, classificationService)),
          Effect.provide(Layer.succeed(ReviewService, reviewService)),
          Effect.catchAll(() => Effect.void) // Ignore the error
        );

        expect(labelSwapCompleted).toBe(true);
        expect(labelResetAttempted).toBe(true);
      }).pipe(Effect.runPromise));
  });
});
