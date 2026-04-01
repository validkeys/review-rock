import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewNotificationData } from "../../src/services/teams-notification.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

describe("TeamsNotificationService", () => {
  const testData: ReviewNotificationData = {
    prNumber: 123,
    prTitle: "Test PR",
    prAuthor: "testuser",
    prUrl: "https://github.com/test/repo/pull/123",
    reviewVerdict: "approve",
    commentUrl: "https://github.com/test/repo/pull/123#issuecomment-456",
    repository: "test/repo",
  };

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("sendReviewNotification", () => {
    it("should send notification successfully", async () => {
      // Setup mock response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const { TeamsNotificationService, TeamsNotificationServiceLive } = await import(
        "../../src/services/teams-notification.js"
      );

      const program = Effect.gen(function* () {
        const service = yield* TeamsNotificationService;
        yield* service.sendReviewNotification("https://webhook.url", testData);
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(TeamsNotificationServiceLive))
      );
      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://webhook.url",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should handle webhook error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      const { TeamsNotificationService, TeamsNotificationServiceLive } = await import(
        "../../src/services/teams-notification.js"
      );

      const program = Effect.gen(function* () {
        const service = yield* TeamsNotificationService;
        yield* service.sendReviewNotification("https://webhook.url", testData);
      });

      const result = await Effect.runPromiseExit(
        program.pipe(Effect.provide(TeamsNotificationServiceLive))
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result) && result.cause._tag === "Fail") {
        expect(result.cause.error._tag).toBe("TeamsNotificationError");
      }
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { TeamsNotificationService, TeamsNotificationServiceLive } = await import(
        "../../src/services/teams-notification.js"
      );

      const program = Effect.gen(function* () {
        const service = yield* TeamsNotificationService;
        yield* service.sendReviewNotification("https://webhook.url", testData);
      });

      const result = await Effect.runPromiseExit(
        program.pipe(Effect.provide(TeamsNotificationServiceLive))
      );
      expect(Exit.isFailure(result)).toBe(true);
    });

    it("should use correct card styling for approve verdict", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const approveData = { ...testData, reviewVerdict: "approve" as const };

      const { TeamsNotificationService, TeamsNotificationServiceLive } = await import(
        "../../src/services/teams-notification.js"
      );

      const program = Effect.gen(function* () {
        const service = yield* TeamsNotificationService;
        yield* service.sendReviewNotification("https://webhook.url", approveData);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TeamsNotificationServiceLive)));

      const callArgs = mockFetch.mock.calls[0];
      const callBody = JSON.parse(callArgs[1].body);
      expect(callBody.attachments[0].content.body[0].text).toContain("Approved");
      expect(callBody.attachments[0].content.body[0].color).toBe("Good");
    });

    it("should use correct card styling for request-changes verdict", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const changesData = {
        ...testData,
        reviewVerdict: "request-changes" as const,
      };

      const { TeamsNotificationService, TeamsNotificationServiceLive } = await import(
        "../../src/services/teams-notification.js"
      );

      const program = Effect.gen(function* () {
        const service = yield* TeamsNotificationService;
        yield* service.sendReviewNotification("https://webhook.url", changesData);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TeamsNotificationServiceLive)));

      const callArgs = mockFetch.mock.calls[0];
      const callBody = JSON.parse(callArgs[1].body);
      expect(callBody.attachments[0].content.body[0].text).toContain("Changes Required");
      expect(callBody.attachments[0].content.body[0].color).toBe("Attention");
    });

    it("should use correct card styling for comment verdict", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const commentData = {
        ...testData,
        reviewVerdict: "comment" as const,
      };

      const { TeamsNotificationService, TeamsNotificationServiceLive } = await import(
        "../../src/services/teams-notification.js"
      );

      const program = Effect.gen(function* () {
        const service = yield* TeamsNotificationService;
        yield* service.sendReviewNotification("https://webhook.url", commentData);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TeamsNotificationServiceLive)));

      const callArgs = mockFetch.mock.calls[0];
      const callBody = JSON.parse(callArgs[1].body);
      expect(callBody.attachments[0].content.body[0].text).toContain("Comments Posted");
      expect(callBody.attachments[0].content.body[0].color).toBe("Accent");
    });
  });
});
