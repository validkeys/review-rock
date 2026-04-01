import { Effect, Layer, Ref } from "effect";
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config/schema.js";
import { LabelClaimFailedError } from "../../src/errors/github.js";
import { processPR } from "../../src/orchestration/workflow.js";
import { ClassificationService } from "../../src/services/classification.js";
import type { PRDetails } from "../../src/services/github.js";
import { GitHubService } from "../../src/services/github.js";
import { ReviewService } from "../../src/services/review.js";

const mockPRDetails: PRDetails = {
  number: 123,
  title: "Test PR",
  body: "Test body",
  url: "https://github.com/owner/repo/pull/123",
  state: "open",
  author: "testuser",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  labels: [],
  files: ["src/file.ts"],
};

const mockDiff = `diff --git a/src/file.ts b/src/file.ts
+++ b/src/file.ts
@@ -1,1 +1,2 @@
+export const foo = 'bar';`;

const testConfig: Config = {
  repository: "owner/repo",
  pollingIntervalMinutes: 5,
  labels: {
    readyForReview: "ready-for-review",
    reviewInProgress: "review-in-progress",
    reviewRefactorRequired: "review-refactor-required",
    reviewApproved: "review-approved",
  },
  frontendPaths: [],
  skills: {
    frontend: "frontend-skill",
    backend: "backend-skill",
    mixed: "mixed-skill",
  },
};

describe("Concurrent Instance Coordination", () => {
  describe("Label Atomicity", () => {
    // TODO: Rewrite for v0.2.0 label-based workflow (no longer uses claimPR)
    it.skip("should allow first instance to claim PR and block second instance", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;

        // Track which instance successfully claimed the PR
        const claimedByRef = yield* Ref.make<string | null>(null);
        const processedByRef = yield* Ref.make<string[]>([]);

        // Mock GitHubService that simulates label atomicity
        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: (_repo: string, _prNumber: number, _label: string) =>
            Effect.gen(function* () {
              const claimedBy = yield* Ref.get(claimedByRef);
              if (claimedBy === null) {
                // First instance succeeds
                yield* Ref.set(claimedByRef, "instance-1");
                yield* Effect.void;
              } else {
                // Second instance fails - label already exists
                yield* Effect.fail(
                  new LabelClaimFailedError({
                    prNumber: _prNumber,
                    reason: `Label '${_label}' already exists on PR #${_prNumber}`,
                  })
                );
              }
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () => Effect.void,
          addLabel: () => Effect.void,
          postCommentWithId: () => Effect.succeed("comment-id-123"),
          updateComment: () => Effect.void,
        });

        const mockClassificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              type: "backend" as const,
              matchedPaths: ["src/file.ts"],
            }),
        });

        const mockReviewService = ReviewService.of({
          generateReview: (_context, _skill) =>
            Effect.gen(function* () {
              yield* Ref.update(processedByRef, (prev) => [...prev, "instance-1"]);
              return "Mock review content";
            }),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GitHubService, mockGitHubService),
          Layer.succeed(ClassificationService, mockClassificationService),
          Layer.succeed(ReviewService, mockReviewService)
        );

        // Instance 1 attempts to claim and process
        const instance1 = processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(testLayer),
          Effect.catchAll(() => Effect.succeed("claim-failed"))
        );

        // Instance 2 attempts to claim and process (should fail)
        const instance2 = processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(testLayer),
          Effect.catchAll(() => Effect.succeed("claim-failed"))
        );

        // Run both instances concurrently
        const [result1, result2] = yield* Effect.all([instance1, instance2], {
          concurrency: "unbounded",
        });

        // Verify only one instance succeeded
        const processedBy = yield* Ref.get(processedByRef);
        expect(processedBy.length).toBe(1);
        expect(processedBy[0]).toBe("instance-1");

        // Verify results
        expect(result1).toContain("Mock review content");
        expect(result2).toBe("claim-failed");

        // Verify claim was made by first instance
        const claimedBy = yield* Ref.get(claimedByRef);
        expect(claimedBy).toBe("instance-1");
      }).pipe(Effect.runPromise));

    // TODO: Rewrite for v0.2.0 label-based workflow (no longer uses claimPR)
    it.skip("should ensure exactly one instance processes a PR when both attempt simultaneously", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 456;
        const label = "review-rock-claimed";

        // Atomic counter to track successful claims
        const successfulClaims = yield* Ref.make(0);
        const attemptedClaims = yield* Ref.make(0);

        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: (_repo: string, _prNumber: number, _label: string) =>
            Effect.gen(function* () {
              yield* Ref.update(attemptedClaims, (n) => n + 1);
              const claims = yield* Ref.get(successfulClaims);

              if (claims === 0) {
                // First claim succeeds
                yield* Ref.update(successfulClaims, (n) => n + 1);
                yield* Effect.void;
              } else {
                // Subsequent claims fail
                yield* Effect.fail(
                  new LabelClaimFailedError({
                    prNumber: _prNumber,
                    reason: "Label already exists",
                  })
                );
              }
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () => Effect.void,
          addLabel: () => Effect.void,
          postCommentWithId: () => Effect.succeed("comment-id-123"),
          updateComment: () => Effect.void,
        });

        const mockClassificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              type: "mixed" as const,
              matchedPaths: ["src/file.ts"],
            }),
        });

        const mockReviewService = ReviewService.of({
          generateReview: () => Effect.succeed("Review content"),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GitHubService, mockGitHubService),
          Layer.succeed(ClassificationService, mockClassificationService),
          Layer.succeed(ReviewService, mockReviewService)
        );

        // Simulate 3 concurrent instances attempting to claim the same PR
        const instances = [
          processPR(repo, prNumber, testConfig).pipe(
            Effect.provide(testLayer),
            Effect.match({
              onFailure: () => "failed",
              onSuccess: () => "success",
            })
          ),
          processPR(repo, prNumber, testConfig).pipe(
            Effect.provide(testLayer),
            Effect.match({
              onFailure: () => "failed",
              onSuccess: () => "success",
            })
          ),
          processPR(repo, prNumber, testConfig).pipe(
            Effect.provide(testLayer),
            Effect.match({
              onFailure: () => "failed",
              onSuccess: () => "success",
            })
          ),
        ];

        // Run all instances concurrently
        const results = yield* Effect.all(instances, { concurrency: "unbounded" });

        // Verify exactly one succeeded
        const successCount = results.filter((r) => r === "success").length;
        expect(successCount).toBe(1);

        // Verify all attempted to claim
        const attempts = yield* Ref.get(attemptedClaims);
        expect(attempts).toBe(3);

        // Verify only one claim succeeded
        const claims = yield* Ref.get(successfulClaims);
        expect(claims).toBe(1);
      }).pipe(Effect.runPromise));
  });

  describe("Claim Release on Error", () => {
    // TODO: Rewrite for v0.2.0 label-based workflow (tests label reset on error)
    it.skip("should remove claim label when workflow fails after successful claim", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 789;
        const label = "review-rock-claimed";

        let labelClaimed = false;
        let labelRemoved = false;

        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: () =>
            Effect.sync(() => {
              labelClaimed = true;
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () =>
            Effect.sync(() => {
              labelRemoved = true;
            }),
          postComment: () => Effect.void,
        });

        const mockClassificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              type: "frontend" as const,
              matchedPaths: ["src/file.ts"],
            }),
        });

        // ReviewService that fails
        const mockReviewService = ReviewService.of({
          generateReview: () => Effect.fail(new Error("Review generation failed")),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GitHubService, mockGitHubService),
          Layer.succeed(ClassificationService, mockClassificationService),
          Layer.succeed(ReviewService, mockReviewService)
        );

        // Process PR and expect failure
        yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(testLayer),
          Effect.catchAll(() => Effect.void)
        );

        // Verify claim was made and then released
        expect(labelClaimed).toBe(true);
        expect(labelRemoved).toBe(true);
      }).pipe(Effect.runPromise));

    // TODO: Rewrite for v0.2.0 label-based workflow (tests label reset on error)
    it.skip("should allow retry by another instance after claim release", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 999;
        const label = "review-rock-claimed";

        const claimAttempts = yield* Ref.make(0);
        const labelRemoved = yield* Ref.make(false);

        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: () =>
            Effect.gen(function* () {
              yield* Ref.update(claimAttempts, (n) => n + 1);
              yield* Effect.void;
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () =>
            Effect.gen(function* () {
              yield* Ref.set(labelRemoved, true);
              yield* Effect.void;
            }),
          postComment: () => Effect.void,
        });

        const mockClassificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              type: "backend" as const,
              matchedPaths: ["src/file.ts"],
            }),
        });

        // First attempt fails during review
        const firstReviewAttempt = yield* Ref.make(true);
        const mockReviewService = ReviewService.of({
          generateReview: () =>
            Effect.gen(function* () {
              const isFirstAttempt = yield* Ref.get(firstReviewAttempt);
              if (isFirstAttempt) {
                yield* Ref.set(firstReviewAttempt, false);
                return yield* Effect.fail(new Error("First attempt fails"));
              }
              // Second attempt succeeds
              return "Review content from retry";
            }),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GitHubService, mockGitHubService),
          Layer.succeed(ClassificationService, mockClassificationService),
          Layer.succeed(ReviewService, mockReviewService)
        );

        // First instance: claim succeeds, review fails, label removed
        yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(testLayer),
          Effect.catchAll(() => Effect.void)
        );

        // Verify first instance released the claim
        const wasRemoved = yield* Ref.get(labelRemoved);
        expect(wasRemoved).toBe(true);

        // Reset removal flag
        yield* Ref.set(labelRemoved, false);

        // Second instance: should succeed now that label was removed
        const result = yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(testLayer),
          Effect.catchAll(() => Effect.succeed("retry-failed"))
        );

        // Verify second instance succeeded
        expect(result).toBe("Review content from retry");

        // Verify both instances attempted to claim
        const attempts = yield* Ref.get(claimAttempts);
        expect(attempts).toBe(2);
      }).pipe(Effect.runPromise));

    // TODO: Rewrite for v0.2.0 label-based workflow (tests final label state)
    it.skip("should not remove claim label on successful workflow completion", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 111;
        const label = "review-rock-claimed";

        let labelClaimed = false;
        let labelRemoved = false;

        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: () =>
            Effect.sync(() => {
              labelClaimed = true;
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () =>
            Effect.sync(() => {
              labelRemoved = true;
            }),
          postComment: () => Effect.void,
        });

        const mockClassificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              type: "mixed" as const,
              matchedPaths: ["src/file.ts"],
            }),
        });

        const mockReviewService = ReviewService.of({
          generateReview: () => Effect.succeed("Successful review"),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GitHubService, mockGitHubService),
          Layer.succeed(ClassificationService, mockClassificationService),
          Layer.succeed(ReviewService, mockReviewService)
        );

        // Process PR successfully
        const result = yield* processPR(repo, prNumber, testConfig).pipe(Effect.provide(testLayer));

        // Verify claim was made but NOT removed
        expect(labelClaimed).toBe(true);
        expect(labelRemoved).toBe(false);
        expect(result).toBe("Successful review");
      }).pipe(Effect.runPromise));
  });

  describe("Race Condition Edge Cases", () => {
    // TODO: Rewrite for v0.2.0 label-based workflow (tests error handling)
    it.skip("should handle claim failure without attempting to remove non-existent label", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 222;
        const label = "review-rock-claimed";

        let removeLabelCalled = false;

        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: () =>
            Effect.fail(
              new LabelClaimFailedError({
                prNumber,
                reason: "Label already exists",
              })
            ),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          removeLabel: () =>
            Effect.sync(() => {
              removeLabelCalled = true;
            }),
          postComment: () => Effect.void,
        });

        const mockClassificationService = ClassificationService.of({
          classifyPR: () =>
            Effect.succeed({
              type: "backend" as const,
              matchedPaths: [],
            }),
        });

        const mockReviewService = ReviewService.of({
          generateReview: () => Effect.succeed("Review"),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GitHubService, mockGitHubService),
          Layer.succeed(ClassificationService, mockClassificationService),
          Layer.succeed(ReviewService, mockReviewService)
        );

        // Attempt to process PR
        yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(testLayer),
          Effect.catchAll(() => Effect.void)
        );

        // Verify removeLabel was NOT called when claim failed
        expect(removeLabelCalled).toBe(false);
      }).pipe(Effect.runPromise));

    // TODO: Rewrite for v0.2.0 label-based workflow (tests error handling)
    it.skip("should gracefully handle label removal failure during error cleanup", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 333;
        const label = "review-rock-claimed";

        let labelClaimed = false;

        const mockGitHubService = GitHubService.of({
          listOpenPRs: () => Effect.succeed([]),
          claimPR: () =>
            Effect.sync(() => {
              labelClaimed = true;
            }),
          getPRDetails: () => Effect.succeed(mockPRDetails),
          getPRDiff: () => Effect.succeed(mockDiff),
          // removeLabel fails
          removeLabel: () => Effect.fail(new Error("Failed to remove label")),
          postComment: () => Effect.void,
        });

        const mockClassificationService = ClassificationService.of({
          classifyPR: () => Effect.fail(new Error("Classification failed")),
        });

        const mockReviewService = ReviewService.of({
          generateReview: () => Effect.succeed("Review"),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(GitHubService, mockGitHubService),
          Layer.succeed(ClassificationService, mockClassificationService),
          Layer.succeed(ReviewService, mockReviewService)
        );

        // Process PR (should fail during classification)
        const error = yield* processPR(repo, prNumber, testConfig).pipe(
          Effect.provide(testLayer),
          Effect.flip // Convert failure to success and vice versa
        );

        // Verify the original error is preserved (not the label removal error)
        expect(String(error)).toContain("Classification failed");
        expect(labelClaimed).toBe(true);
      }).pipe(Effect.runPromise));
  });
});
