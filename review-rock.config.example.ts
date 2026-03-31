import type { Config } from "./src/config/schema.js";

/**
 * Review Rock Configuration Example
 *
 * Copy this file to `review-rock.config.ts` and customize for your repository.
 *
 * ## Configuration Precedence (highest to lowest)
 * 1. Configuration file (review-rock.config.ts)
 * 2. Environment variables (REVIEW_ROCK_*)
 * 3. Default values
 *
 * ## Environment Variable Overrides
 * You can override any configuration option using environment variables:
 *
 * ```bash
 * export REVIEW_ROCK_REPOSITORY="owner/repo"
 * export REVIEW_ROCK_POLLING_INTERVAL="10"
 * export REVIEW_ROCK_CLAIM_LABEL="my-bot-claimed"
 * ```
 *
 * ## Skill Installation
 * Before using Review Rock, ensure all configured skills are installed:
 *
 * ```bash
 * # Install a skill
 * claudecode skill add <skill-url>
 *
 * # Verify installed skills
 * claudecode skill list
 * ```
 *
 * For skill URLs, see: https://github.com/anthropics/claude-code/tree/main/skills
 *
 * ## Common Configuration Scenarios
 *
 * ### Single Repository Monitoring
 * ```typescript
 * {
 *   repository: "myorg/myrepo",
 *   pollingIntervalMinutes: 5,
 *   claimLabel: "review-rock-claimed",
 *   frontendPaths: ["src/frontend", "apps/web"],
 *   skills: {
 *     frontend: "vercel-react-best-practices",
 *     backend: "typescript-expert",
 *     mixed: "vercel-react-best-practices,typescript-expert"
 *   }
 * }
 * ```
 *
 * ### Custom Frontend Path Patterns
 * ```typescript
 * {
 *   // Match multiple frontend directories
 *   frontendPaths: [
 *     "apps/frontend",
 *     "apps/mobile",
 *     "packages/ui",
 *     "packages/components",
 *     "src/components",
 *     "src/pages"
 *   ]
 * }
 * ```
 *
 * ### Different Polling Intervals
 * ```typescript
 * {
 *   // Check every 2 minutes (aggressive, more API calls)
 *   pollingIntervalMinutes: 2,
 *
 *   // Check every 15 minutes (conservative, fewer API calls)
 *   pollingIntervalMinutes: 15
 * }
 * ```
 *
 * ### Multiple Skills Configuration
 * ```typescript
 * {
 *   skills: {
 *     // Single skill for frontend
 *     frontend: "vercel-react-best-practices",
 *
 *     // Single skill for backend
 *     backend: "typescript-expert",
 *
 *     // Multiple skills for mixed PRs (comma-separated)
 *     mixed: "vercel-react-best-practices,typescript-expert,contracted"
 *   }
 * }
 * ```
 *
 * ## Validation Rules
 * - `repository`: Required. Must be in "owner/repo" format
 * - `pollingIntervalMinutes`: Optional (default: 5). Must be > 0
 * - `claimLabel`: Optional (default: "review-rock-claimed"). Non-empty string
 * - `frontendPaths`: Optional (default: []). Array of path strings
 * - `skills.frontend`: Required. Non-empty string
 * - `skills.backend`: Required. Non-empty string
 * - `skills.mixed`: Required. Non-empty string
 *
 * Invalid configurations will fail validation at startup with clear error messages.
 */
const config: Config = {
  /**
   * GitHub repository in owner/name format
   *
   * @required
   * @example "validkeys/lumen"
   * @example "facebook/react"
   * @example "microsoft/typescript"
   *
   * This specifies which repository Review Rock will monitor for pull requests.
   * The repository must be accessible via the authenticated `gh` CLI.
   *
   * Environment variable: REVIEW_ROCK_REPOSITORY
   */
  repository: "validkeys/lumen",

  /**
   * Polling interval in minutes
   *
   * @optional
   * @default 5
   * @validation Must be > 0
   *
   * How often Review Rock checks for new unclaimed pull requests.
   * - Lower values (1-2): Faster response time, more API calls, higher GitHub rate limit usage
   * - Moderate values (5-10): Balanced response time and API usage (recommended)
   * - Higher values (15-30): Slower response time, fewer API calls, lower rate limit usage
   *
   * Note: GitHub has rate limits (5000 requests/hour authenticated, 60/hour unauthenticated).
   * Ensure `gh` CLI is authenticated for higher limits.
   *
   * Environment variable: REVIEW_ROCK_POLLING_INTERVAL
   */
  pollingIntervalMinutes: 5,

  /**
   * Label to apply when claiming a PR for review
   *
   * @optional
   * @default "review-rock-claimed"
   *
   * This label is added atomically to PRs when Review Rock claims them for review.
   * The label prevents multiple instances from reviewing the same PR.
   *
   * How it works:
   * 1. Review Rock finds unclaimed PRs (without this label)
   * 2. Adds the claim label to mark the PR as claimed
   * 3. Only the instance that successfully adds the label reviews the PR
   *
   * Multiple instances can run safely using the same claim label—only one will
   * successfully claim each PR due to GitHub's atomic label operations.
   *
   * Custom labels are useful when:
   * - Running multiple Review Rock deployments for different purposes
   * - Distinguishing between different bot instances
   * - Integrating with existing label workflows
   *
   * Environment variable: REVIEW_ROCK_CLAIM_LABEL
   */
  claimLabel: "review-rock-claimed",

  /**
   * Array of frontend path patterns for identifying frontend-only changes
   *
   * @optional
   * @default []
   *
   * PRs that only modify files in these paths will be classified as "frontend"
   * and routed to the frontend skill. PRs with no frontend changes are classified
   * as "backend". PRs with both are classified as "mixed".
   *
   * Path matching:
   * - Exact match: "apps/frontend" matches "apps/frontend/..." only
   * - Prefix match: All paths starting with the configured path are matched
   * - Case-sensitive: "Apps/Frontend" ≠ "apps/frontend"
   *
   * Classification logic:
   * - Frontend: ALL changed files are in frontendPaths
   * - Backend: NO changed files are in frontendPaths
   * - Mixed: SOME changed files are in frontendPaths, SOME are not
   *
   * Examples:
   * - Monorepo: ["apps/web", "apps/mobile", "packages/ui"]
   * - Single app: ["src/components", "src/pages", "src/styles"]
   * - Multiple packages: ["frontend", "client", "web"]
   *
   * Leave empty ([]) if you don't want frontend/backend distinction—all PRs
   * will be classified as "backend" and use the backend skill.
   *
   * No environment variable override available (use config file only).
   */
  frontendPaths: ["apps/react-webapp", "lib/core-ui-system"],

  /**
   * Skill mappings for different types of PRs
   *
   * Skills determine which Claude Code skill is used for reviewing each PR type:
   * - `frontend`: Used for PRs that only touch frontend paths
   * - `backend`: Used for PRs that only touch backend code
   * - `mixed`: Used for PRs that touch both frontend and backend
   *
   * Skill names must match skills installed in your claudecode CLI.
   * Verify installed skills: `claudecode skill list`
   *
   * Multiple skills:
   * - Comma-separated: "skill1,skill2,skill3"
   * - All skills are applied in sequence to the review
   * - Useful for applying multiple expertise areas (e.g., React + TypeScript)
   *
   * Skill installation:
   * ```bash
   * claudecode skill add <skill-url>
   * ```
   *
   * Common skills:
   * - vercel-react-best-practices: React/Next.js performance optimization
   * - typescript-expert: TypeScript type safety and patterns
   * - contracted: Service-command pattern with @validkeys/contracted
   * - react-doctor: React code quality checks
   * - web-design-guidelines: UI/UX best practices
   *
   * For more skills, see: https://github.com/anthropics/claude-code/tree/main/skills
   */
  skills: {
    /**
     * Skill for frontend-only PRs
     *
     * @required
     * @example "vercel-react-best-practices"
     * @example "react-doctor"
     * @example "web-design-guidelines"
     *
     * Applied when all PR changes are in frontendPaths.
     * Use skills specialized in frontend technologies (React, Vue, Angular, etc.)
     * or UI/UX best practices.
     */
    frontend: "vercel-react-best-practices",

    /**
     * Skill for backend-only PRs
     *
     * @required
     * @example "typescript-expert"
     * @example "contracted"
     * @example "typescript-expert,contracted"
     *
     * Applied when PR has no changes in frontendPaths.
     * Use skills specialized in backend technologies (Node.js, databases, APIs, etc.)
     * or architectural patterns.
     */
    backend: "typescript-expert",

    /**
     * Skill for mixed frontend/backend PRs
     *
     * @required
     * @example "vercel-react-best-practices,typescript-expert"
     * @example "vercel-react-best-practices,typescript-expert,contracted"
     *
     * Applied when PR has changes in both frontendPaths and other paths.
     * Typically combines frontend and backend skills to cover all aspects
     * of the full-stack change.
     */
    mixed: "vercel-react-best-practices,typescript-expert",
  },
};

export default config;
