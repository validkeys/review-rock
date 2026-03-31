import type { Config } from "./src/config/schema.js";

/**
 * Review Rock Configuration Example
 *
 * Copy this file to `review-rock.config.ts` and customize for your repository.
 *
 * Configuration precedence (highest to lowest):
 * 1. Configuration file (review-rock.config.ts)
 * 2. Environment variables (REVIEW_ROCK_*)
 * 3. Default values
 */
const config: Config = {
  /**
   * GitHub repository in owner/name format
   *
   * Example: "validkeys/lumen"
   *
   * This specifies which repository Review Rock will monitor for pull requests.
   */
  repository: "validkeys/lumen",

  /**
   * Polling interval in minutes (must be > 0)
   *
   * Default: 5
   *
   * How often Review Rock checks for new unclaimed pull requests.
   * Lower values mean faster response time but more API calls.
   */
  pollingIntervalMinutes: 5,

  /**
   * Label to apply when claiming a PR for review
   *
   * Default: "review-rock-claimed"
   *
   * This label is added to PRs when Review Rock claims them for review.
   * Prevents multiple instances from reviewing the same PR.
   */
  claimLabel: "review-rock-claimed",

  /**
   * Array of frontend path patterns for identifying frontend-only changes
   *
   * Default: []
   *
   * PRs that only modify files in these paths will be routed to the frontend skill.
   * Supports glob patterns and directory paths.
   *
   * Examples:
   * - "apps/react-webapp"
   * - "lib/core-ui-system"
   * - "packages/frontend"
   * - "src/components"
   */
  frontendPaths: ["apps/react-webapp", "lib/core-ui-system"],

  /**
   * Skill mappings for different types of PRs
   *
   * Skills determine which Claude Code skill is used for reviewing:
   * - frontend: Used for PRs that only touch frontend paths
   * - backend: Used for PRs that only touch backend code
   * - mixed: Used for PRs that touch both frontend and backend
   *
   * Skill names should match available Claude Code skills.
   * Multiple skills can be comma-separated (e.g., "skill1,skill2").
   */
  skills: {
    /**
     * Skill for frontend-only PRs
     *
     * Example: "vercel-react-best-practices"
     */
    frontend: "vercel-react-best-practices",

    /**
     * Skill for backend-only PRs
     *
     * Example: "typescript-expert"
     */
    backend: "typescript-expert",

    /**
     * Skill for mixed frontend/backend PRs
     *
     * Example: "vercel-react-best-practices,typescript-expert"
     */
    mixed: "vercel-react-best-practices,typescript-expert",
  },
};

export default config;
