import { Context, Effect } from "effect";
import type { TeamsNotificationError } from "../errors/teams.js";

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
