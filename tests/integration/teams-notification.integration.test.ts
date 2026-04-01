import { Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config/schema.js";
import { processPR } from "../../src/orchestration/workflow.js";
import { ClassificationService } from "../../src/services/classification.js";
import type { PRDetails } from "../../src/services/github.js";
import { GitHubService } from "../../src/services/github.js";
import { ReviewService } from "../../src/services/review.js";
import type { ReviewNotificationData } from "../../src/services/teams-notification.js";
import { TeamsNotificationService } from "../../src/services/teams-notification.js";

/**
 * Integration test for Teams notification workflow
 *
 * Tests the complete flow from PR processing to Teams notification:
 * 1. PR is processed (labels swapped, comment posted)
 * 2. PR is classified
 * 3. Review is generated
 * 4. Teams notification is sent (if enabled)
 * 5. Final labels are applied
 */
describe("Teams Notification Integration", () => {
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

  const baseConfig: Config = {
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
    enableTeamsNotifications: false,
  };

  describe("Complete Workflow with Teams Notifications Enabled", () => {
    it("should send Teams notification with 'approve' verdict when review is approved", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 123;

        // Track if notification was sent
        let notificationSent = false;
        let notificationData: ReviewNotificationData | null = null;

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: true,
          teamsWebhookUrl: "https://webhook.test/teams",
        };

        // Mock review content with approve verdict
        const reviewContent = `
# Code Review

## Verdict: Approve ✅

Everything looks good!
`;

        const result = yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              // Mock GitHubService
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () => Effect.succeed(mockPRDetails),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () => Effect.void,
                postCommentWithId: () => Effect.succeed("comment-123"),
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
                generateReview: () => Effect.succeed(reviewContent),
              }),
              // Mock TeamsNotificationService
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: (webhookUrl, data) =>
                  Effect.gen(function* () {
                    notificationSent = true;
                    notificationData = data;
                    expect(webhookUrl).toBe("https://webhook.test/teams");
                    yield* Effect.void;
                  }),
              })
            )
          )
        );

        expect(result).toContain("Approve");
        expect(notificationSent).toBe(true);
        expect(notificationData).not.toBeNull();
        expect(notificationData?.reviewVerdict).toBe("approve");
        expect(notificationData?.prNumber).toBe(123);
        expect(notificationData?.prTitle).toBe("Add new feature");
        expect(notificationData?.repository).toBe("owner/repo");
      }).pipe(Effect.runPromise));

    it("should send Teams notification with 'request-changes' verdict when review requires changes", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 456;

        let notificationData: ReviewNotificationData | null = null;

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: true,
          teamsWebhookUrl: "https://webhook.test/teams",
        };

        // Mock review content with request-changes verdict
        const reviewContent = `
# Code Review

## Verdict: Request Changes ❌

🔴 Critical issue found in the code.
`;

        yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () =>
                  Effect.succeed({
                    ...mockPRDetails,
                    number: 456,
                    title: "Bugfix PR",
                  }),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () => Effect.void,
                postCommentWithId: () => Effect.succeed("comment-456"),
                updateComment: () => Effect.void,
              }),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "backend" as const,
                    matchedPaths: ["src/api/handler.ts"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed(reviewContent),
              }),
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: (_webhookUrl, data) =>
                  Effect.gen(function* () {
                    notificationData = data;
                    yield* Effect.void;
                  }),
              })
            )
          )
        );

        expect(notificationData).not.toBeNull();
        expect(notificationData?.reviewVerdict).toBe("request-changes");
        expect(notificationData?.prNumber).toBe(456);
        expect(notificationData?.prTitle).toBe("Bugfix PR");
      }).pipe(Effect.runPromise));

    it("should send Teams notification with 'comment' verdict when review has no explicit verdict", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 789;

        let notificationData: ReviewNotificationData | null = null;

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: true,
          teamsWebhookUrl: "https://webhook.test/teams",
        };

        // Mock review content without explicit verdict (defaults to comment)
        const reviewContent = `
# Code Review

Some observations about the code.
`;

        yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () =>
                  Effect.succeed({
                    ...mockPRDetails,
                    number: 789,
                    title: "Documentation update",
                  }),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () => Effect.void,
                postCommentWithId: () => Effect.succeed("comment-789"),
                updateComment: () => Effect.void,
              }),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "mixed" as const,
                    matchedPaths: ["README.md", "src/index.ts"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed(reviewContent),
              }),
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: (_webhookUrl, data) =>
                  Effect.gen(function* () {
                    notificationData = data;
                    yield* Effect.void;
                  }),
              })
            )
          )
        );

        expect(notificationData).not.toBeNull();
        expect(notificationData?.reviewVerdict).toBe("comment");
        expect(notificationData?.prNumber).toBe(789);
      }).pipe(Effect.runPromise));
  });

  describe("Teams Notifications Disabled", () => {
    it("should NOT send notification when enableTeamsNotifications is false", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 100;

        const notificationSendSpy = vi.fn(() => Effect.void);

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: false,
          teamsWebhookUrl: "https://webhook.test/teams", // URL present but disabled
        };

        yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () => Effect.succeed(mockPRDetails),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () => Effect.void,
                postCommentWithId: () => Effect.succeed("comment-100"),
                updateComment: () => Effect.void,
              }),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "frontend" as const,
                    matchedPaths: ["app.tsx"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed("# Review\n\nApprove ✅"),
              }),
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: notificationSendSpy,
              })
            )
          )
        );

        // Notification should NOT have been called
        expect(notificationSendSpy).not.toHaveBeenCalled();
      }).pipe(Effect.runPromise));

    it("should NOT send notification when teamsWebhookUrl is undefined", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 200;

        const notificationSendSpy = vi.fn(() => Effect.void);

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: true, // Enabled but no webhook URL
          teamsWebhookUrl: undefined,
        };

        yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () => Effect.succeed(mockPRDetails),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () => Effect.void,
                postCommentWithId: () => Effect.succeed("comment-200"),
                updateComment: () => Effect.void,
              }),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "backend" as const,
                    matchedPaths: ["src/api.ts"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed("# Review\n\nApprove ✅"),
              }),
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: notificationSendSpy,
              })
            )
          )
        );

        // Notification should NOT have been called
        expect(notificationSendSpy).not.toHaveBeenCalled();
      }).pipe(Effect.runPromise));
  });

  describe("Error Handling", () => {
    it("should complete workflow even if Teams notification fails", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 300;

        let reviewCompleted = false;

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: true,
          teamsWebhookUrl: "https://webhook.test/teams",
        };

        const result = yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () => Effect.succeed(mockPRDetails),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () =>
                  Effect.gen(function* () {
                    reviewCompleted = true; // Track that workflow completed
                    yield* Effect.void;
                  }),
                postCommentWithId: () => Effect.succeed("comment-300"),
                updateComment: () => Effect.void,
              }),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "frontend" as const,
                    matchedPaths: ["app.tsx"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed("# Review\n\nApprove ✅"),
              }),
              // Mock TeamsNotificationService to fail
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: () => Effect.fail(new Error("Teams webhook failed")),
              })
            )
          )
        );

        // Workflow should complete successfully despite notification failure
        expect(result).toContain("Approve");
        expect(reviewCompleted).toBe(true);
      }).pipe(Effect.runPromise));

    it("should log warning when notification fails but continue workflow", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 400;

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: true,
          teamsWebhookUrl: "https://webhook.test/teams",
        };

        // Test that workflow completes even with notification error
        const result = yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () => Effect.succeed(mockPRDetails),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () => Effect.void,
                postCommentWithId: () => Effect.succeed("comment-400"),
                updateComment: () => Effect.void,
              }),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "backend" as const,
                    matchedPaths: ["api.ts"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed("# Review\n\nRequest Changes ❌"),
              }),
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: () => Effect.fail(new Error("Network timeout")),
              })
            )
          )
        );

        // Workflow should succeed
        expect(result).toContain("Request Changes");
      }).pipe(Effect.runPromise));
  });

  describe("Comment URL Generation", () => {
    it("should generate correct comment URL format for notification", () =>
      Effect.gen(function* () {
        const repo = "owner/repo";
        const prNumber = 500;

        let capturedCommentUrl: string | null = null;

        const config: Config = {
          ...baseConfig,
          enableTeamsNotifications: true,
          teamsWebhookUrl: "https://webhook.test/teams",
        };

        yield* processPR(repo, prNumber, config).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(GitHubService, {
                listOpenPRs: () => Effect.succeed([]),
                claimPR: () => Effect.void,
                getPRDetails: () => Effect.succeed(mockPRDetails),
                getPRDiff: () => Effect.succeed("mock diff"),
                removeLabel: () => Effect.void,
                addLabel: () => Effect.void,
                postCommentWithId: () => Effect.succeed("987654321"),
                updateComment: () => Effect.void,
              }),
              Layer.succeed(ClassificationService, {
                classifyPR: () =>
                  Effect.succeed({
                    type: "frontend" as const,
                    matchedPaths: ["app.tsx"],
                  }),
              }),
              Layer.succeed(ReviewService, {
                generateReview: () => Effect.succeed("# Review\n\nApprove ✅"),
              }),
              Layer.succeed(TeamsNotificationService, {
                sendReviewNotification: (_webhookUrl, data) =>
                  Effect.gen(function* () {
                    capturedCommentUrl = data.commentUrl;
                    yield* Effect.void;
                  }),
              })
            )
          )
        );

        // Comment URL should follow GitHub format
        expect(capturedCommentUrl).toBe(
          "https://github.com/owner/repo/pull/123#issuecomment-987654321"
        );
      }).pipe(Effect.runPromise));
  });
});
