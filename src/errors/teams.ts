import { Data } from "effect";

/**
 * Error when Teams webhook notification fails
 */
export class TeamsNotificationError extends Data.TaggedError("TeamsNotificationError")<{
  readonly message: string;
  readonly statusCode?: number;
}> {}
