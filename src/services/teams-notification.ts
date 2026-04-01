import { Context, Effect, Layer } from "effect";
import { TeamsNotificationError } from "../errors/teams.js";

/**
 * Review notification data for Teams
 */
export interface ReviewNotificationData {
  readonly prNumber: number;
  readonly prTitle: string;
  readonly prAuthor: string;
  readonly prUrl: string;
  readonly reviewVerdict: "approve" | "request-changes" | "comment";
  readonly commentUrl: string;
  readonly repository: string;
}

/**
 * TeamsNotificationService sends review notifications to Microsoft Teams
 *
 * Sends adaptive card notifications when PR reviews are completed.
 * Handles webhook POST requests with proper error handling and logging.
 */
export interface TeamsNotificationService {
  /**
   * Send a review notification to Teams webhook
   * @param webhookUrl - Teams incoming webhook URL
   * @param data - Review notification data
   * @returns Effect that resolves to void or TeamsNotificationError
   */
  readonly sendReviewNotification: (
    webhookUrl: string,
    data: ReviewNotificationData
  ) => Effect.Effect<void, TeamsNotificationError>;
}

/**
 * TeamsNotificationService tag for dependency injection
 */
export const TeamsNotificationService = Context.GenericTag<TeamsNotificationService>(
  "@services/TeamsNotificationService"
);

/**
 * Get card color and title based on review verdict
 */
const getCardStyling = (
  verdict: ReviewNotificationData["reviewVerdict"]
): { color: "Good" | "Attention" | "Accent"; title: string } => {
  switch (verdict) {
    case "approve":
      return { color: "Good", title: "PR Review - Approved ✅" };
    case "request-changes":
      return { color: "Attention", title: "PR Review - Changes Required ❌" };
    case "comment":
      return { color: "Accent", title: "PR Review - Comments Posted 💬" };
  }
};

/**
 * Build Microsoft Teams Adaptive Card payload
 * Reference: https://adaptivecards.io/designer/
 */
const buildAdaptiveCardPayload = (data: ReviewNotificationData): object => {
  const styling = getCardStyling(data.reviewVerdict);
  const timestamp = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: data.commentUrl,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: styling.title,
              weight: "Bolder",
              size: "Large",
              color: styling.color,
            },
            {
              type: "TextBlock",
              text: "Review Details",
              weight: "Bolder",
              size: "Medium",
            },
            {
              type: "FactSet",
              facts: [
                {
                  title: "PR:",
                  value: `#${data.prNumber} - ${data.prTitle}`,
                },
                {
                  title: "Author:",
                  value: data.prAuthor,
                },
                {
                  title: "Repository:",
                  value: data.repository,
                },
                {
                  title: "Date:",
                  value: timestamp,
                },
              ],
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View PR",
              url: data.prUrl,
            },
            {
              type: "Action.OpenUrl",
              title: "View Review",
              url: data.commentUrl,
            },
          ],
        },
      },
    ],
  };
};

/**
 * Send notification to Teams webhook
 */
const executeSendNotification = (
  webhookUrl: string,
  data: ReviewNotificationData
): Effect.Effect<void, TeamsNotificationError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Sending Teams notification for PR #${data.prNumber}`);

    const payload = buildAdaptiveCardPayload(data);

    // Send webhook request using fetch
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
      catch: (error) =>
        new TeamsNotificationError({
          message: `Failed to send Teams notification: ${String(error)}`,
        }),
    });

    // Check response status
    if (!response.ok) {
      return yield* Effect.fail(
        new TeamsNotificationError({
          message: `Teams webhook returned error: ${response.status} ${response.statusText}`,
          statusCode: response.status,
        })
      );
    }

    yield* Effect.logInfo(`✓ Teams notification sent for PR #${data.prNumber}`);
  });

/**
 * Live implementation of TeamsNotificationService
 */
export const TeamsNotificationServiceLive = Layer.succeed(
  TeamsNotificationService,
  TeamsNotificationService.of({
    sendReviewNotification: (webhookUrl: string, data: ReviewNotificationData) =>
      executeSendNotification(webhookUrl, data),
  })
);
