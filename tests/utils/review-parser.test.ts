import { describe, expect, it } from "vitest";
import type { PRDetails } from "../../src/services/github.js";
import {
  buildReviewNotificationData,
  extractReviewVerdict,
} from "../../src/utils/review-parser.js";

describe("extractReviewVerdict", () => {
  it("should extract approve verdict from explicit approval", () => {
    const content = "Review looks good. Approve ✅";
    expect(extractReviewVerdict(content)).toBe("approve");
  });

  it("should extract approve verdict from verdict line", () => {
    const content = "Some review text\n\nVerdict: Approve";
    expect(extractReviewVerdict(content)).toBe("approve");
  });

  it("should extract request-changes from explicit marker", () => {
    const content = "Issues found. Request Changes ❌";
    expect(extractReviewVerdict(content)).toBe("request-changes");
  });

  it("should extract request-changes from verdict line", () => {
    const content = "Problems detected\n\nVerdict: Request Changes";
    expect(extractReviewVerdict(content)).toBe("request-changes");
  });

  it("should extract request-changes when critical issues present", () => {
    const content = "Found issues:\n🔴 Critical: Security vulnerability";
    expect(extractReviewVerdict(content)).toBe("request-changes");
  });

  it("should default to comment for ambiguous content", () => {
    const content = "Some general feedback without explicit verdict";
    expect(extractReviewVerdict(content)).toBe("comment");
  });

  it("should be case-insensitive", () => {
    const content = "APPROVE ✅";
    expect(extractReviewVerdict(content)).toBe("approve");
  });

  it("should handle empty content", () => {
    const content = "";
    expect(extractReviewVerdict(content)).toBe("comment");
  });
});

describe("buildReviewNotificationData", () => {
  const mockPRDetails: PRDetails = {
    number: 123,
    title: "Test PR",
    body: "PR description",
    url: "https://github.com/test/repo/pull/123",
    state: "open",
    author: "testuser",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    labels: ["ready-for-review"],
    files: ["src/test.ts"],
  };

  it("should build notification data with approve verdict", () => {
    const reviewContent = "Looks good! Approve ✅";
    const commentUrl = "https://github.com/test/repo/pull/123#comment-456";

    const result = buildReviewNotificationData(mockPRDetails, reviewContent, commentUrl);

    expect(result).toEqual({
      prNumber: 123,
      prTitle: "Test PR",
      prAuthor: "testuser",
      prUrl: "https://github.com/test/repo/pull/123",
      reviewVerdict: "approve",
      commentUrl,
      repository: "",
    });
  });

  it("should build notification data with request-changes verdict", () => {
    const reviewContent = "🔴 Critical issues found";
    const commentUrl = "https://github.com/test/repo/pull/123#comment-789";

    const result = buildReviewNotificationData(mockPRDetails, reviewContent, commentUrl);

    expect(result.reviewVerdict).toBe("request-changes");
    expect(result.prNumber).toBe(123);
  });

  it("should default to comment verdict for ambiguous content", () => {
    const reviewContent = "Some general feedback";
    const commentUrl = "https://github.com/test/repo/pull/123#comment-111";

    const result = buildReviewNotificationData(mockPRDetails, reviewContent, commentUrl);

    expect(result.reviewVerdict).toBe("comment");
  });
});
