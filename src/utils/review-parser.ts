import type { PRDetails } from "../services/github.js";
import type { ReviewNotificationData } from "../services/teams-notification.js";

/**
 * Review verdict extracted from review content
 */
export type ReviewVerdict = "approve" | "request-changes" | "comment";

/**
 * Extracts the review verdict from review content
 *
 * Analyzes review text for explicit verdicts and critical issue markers.
 * Priority order:
 * 1. Explicit "Approve ✅" or "verdict: approve"
 * 2. Explicit "Request Changes ❌" or "verdict: request changes"
 * 3. Critical issues (🔴) → request-changes
 * 4. Default → comment (safest fallback)
 *
 * @param reviewContent - The full review text from Claude
 * @returns The extracted verdict
 */
export const extractReviewVerdict = (reviewContent: string): ReviewVerdict => {
  const lowerContent = reviewContent.toLowerCase();

  // Check for explicit approval verdict
  if (lowerContent.includes("approve ✅") || lowerContent.includes("verdict: approve")) {
    return "approve";
  }

  // Check for explicit request changes verdict
  if (
    lowerContent.includes("request changes ❌") ||
    lowerContent.includes("verdict: request changes")
  ) {
    return "request-changes";
  }

  // Check for critical issues (🔴)
  if (lowerContent.includes("🔴") || lowerContent.includes("critical")) {
    return "request-changes";
  }

  // Default to comment (safer than approve)
  return "comment";
};

/**
 * Build ReviewNotificationData from PR details, verdict, and comment URL
 *
 * @param details - PR details from GitHubService
 * @param reviewContent - The full review text
 * @param commentUrl - URL to the posted review comment
 * @returns Complete notification data ready for Teams
 */
export const buildReviewNotificationData = (
  details: PRDetails,
  reviewContent: string,
  commentUrl: string
): ReviewNotificationData => {
  const verdict = extractReviewVerdict(reviewContent);

  return {
    prNumber: details.number,
    prTitle: details.title,
    prAuthor: details.author,
    prUrl: details.url,
    reviewVerdict: verdict,
    commentUrl,
    repository: "", // Will be filled by caller with actual repo
  };
};
