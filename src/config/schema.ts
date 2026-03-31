import { Schema } from "@effect/schema";

/**
 * Skills configuration mapping path types to skill names
 */
const SkillsSchema = Schema.Struct({
  frontend: Schema.String,
  backend: Schema.String,
  mixed: Schema.String,
});

/**
 * Configuration schema for Review Rock
 *
 * Defines the structure and validation rules for the application configuration.
 */
export const ConfigSchema = Schema.Struct({
  /**
   * GitHub repository in owner/name format (e.g., "validkeys/lumen")
   */
  repository: Schema.String,

  /**
   * Polling interval in minutes (must be > 0)
   */
  pollingIntervalMinutes: Schema.Number.pipe(
    Schema.positive({ message: () => "pollingIntervalMinutes must be greater than 0" })
  ),

  /**
   * Label to apply when claiming a PR for review
   */
  claimLabel: Schema.String,

  /**
   * Array of frontend path patterns for identifying frontend-only changes
   */
  frontendPaths: Schema.Array(Schema.String),

  /**
   * Skill mappings for different types of PRs
   */
  skills: SkillsSchema,
});

/**
 * TypeScript type derived from ConfigSchema
 */
export type Config = Schema.Schema.Type<typeof ConfigSchema>;
