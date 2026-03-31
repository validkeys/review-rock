import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { LabelClaimFailedError } from "../../src/errors/github.js";
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

describe("Workflow Orchestration", () => {
  describe("processPR", () => {
    it("should successfully process a PR through complete workflow", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;
        const label = "reviewing";

        const result = yield* processPR(repo, prNumber, label);

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

    it("should not remove label if claim fails", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;
        const label = "reviewing";

        const labelRemoved = false;

        yield* processPR(repo, prNumber, label).pipe(
          Effect.catchAll(() => Effect.void) // Ignore the error
        );

        expect(labelRemoved).toBe(false);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(GitHubService, {
              listOpenPRs: () => Effect.succeed([]),
              claimPR: () => Effect.fail(new LabelClaimFailedError("Already claimed")),
              getPRDetails: () => Effect.succeed(mockPRDetails),
              getPRDiff: () => Effect.succeed(mockDiff),
              removeLabel: () => {
                // This should NOT be called if claim fails
                throw new Error("removeLabel should not be called when claim fails");
              },
            }),
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
        ),
        Effect.runPromise
      ));

    it("should remove label if classification fails after claim", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;
        const label = "reviewing";

        let claimSucceeded = false;
        let labelRemoved = false;

        const gitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: () =>
            Effect.gen(function* () {
              claimSucceeded = true;
              yield* Effect.void;
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () =>
            Effect.gen(function* () {
              labelRemoved = true;
              yield* Effect.void;
            }),
        });

        const classificationService = ClassificationService.of({
          classifyPR: () => Effect.fail(new Error("Classification failed")),
        });

        const reviewService = ReviewService.of({
          generateReview: () => Effect.succeed("Mock review"),
        });

        yield* processPR(repo, prNumber, label).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, gitHubService),
              Layer.succeed(ClassificationService, classificationService),
              Layer.succeed(ReviewService, reviewService)
            )
          ),
          Effect.catchAll(() => Effect.void) // Ignore the error
        );

        expect(claimSucceeded).toBe(true);
        expect(labelRemoved).toBe(true);
      }).pipe(Effect.runPromise));

    it("should remove label if review generation fails after claim", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;
        const label = "reviewing";

        let claimSucceeded = false;
        let labelRemoved = false;

        const gitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: () =>
            Effect.gen(function* () {
              claimSucceeded = true;
              yield* Effect.void;
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () =>
            Effect.gen(function* () {
              labelRemoved = true;
              yield* Effect.void;
            }),
        });

        const classificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              classification: "frontend" as const,
              frontendFiles: ["apps/react-webapp/src/components/Button.tsx"],
              backendFiles: [],
              totalFiles: 1,
            }),
        });

        const reviewService = ReviewService.of({
          generateReview: () =>
            Effect.fail(new ReviewGenerationError("Review generation failed", "timeout")),
        });

        yield* processPR(repo, prNumber, label).pipe(
          Effect.provide(Layer.succeed(GitHubService, gitHubService)),
          Effect.provide(Layer.succeed(ClassificationService, classificationService)),
          Effect.provide(Layer.succeed(ReviewService, reviewService)),
          Effect.catchAll(() => Effect.void) // Ignore the error
        );

        expect(claimSucceeded).toBe(true);
        expect(labelRemoved).toBe(true);
      }).pipe(Effect.runPromise));
  });
});
