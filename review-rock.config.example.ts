import type { Config } from "./src/config/schema.js";

/**
 * Review Rock Configuration Example
 *
 * Copy this file to `review-rock.config.ts` and customize for your repository.
 *
 * ## Label-Based Workflow
 *
 * Review Rock uses GitHub labels to track PR review state:
 *
 * ```
 * ready-for-review → review-in-progress → review-approved
 *                                       ↘ review-refactor-required
 * ```
 *
 * 1. Add "ready-for-review" label to PRs you want reviewed
 * 2. Review Rock automatically:
 *    - Removes "ready-for-review", adds "review-in-progress"
 *    - Posts "🤖 analyzing..." comment
 *    - Generates review using Claude /review command
 *    - Analyzes review to determine outcome
 *    - Updates comment with full review
 *    - Removes "review-in-progress", adds final label
 * 3. On error: Resets to "ready-for-review" for retry
 *
 * ## Skill Installation (Optional)
 * Built-in skills like "typescript-expert" work without installation.
 * For custom skills:
 *
 * ```bash
 * # Install a skill
 * claude skill add <skill-url>
 *
 * # Verify installed skills
 * claude skill list
 * ```
 *
 * ## Common Configuration Scenarios
 *
 * ### Single Repository Monitoring
 * ```typescript
 * {
 *   repository: "myorg/myrepo",
 *   pollingIntervalMinutes: 5,
 *   labels: {
 *     readyForReview: "ready-for-review",
 *     reviewInProgress: "review-in-progress",
 *     reviewRefactorRequired: "review-refactor-required",
 *     reviewApproved: "review-approved"
 *   },
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
 * - `labels.*`: Optional. Each label must be a non-empty string
 * - `frontendPaths`: Optional (default: []). Array of path strings
 * - `skills.frontend`: Required. Non-empty string
 * - `skills.backend`: Required. Non-empty string
 * - `skills.mixed`: Required. Non-empty string
 *
 * Invalid configurations will fail validation at startup with clear error messages.
 *
 * ## Label Auto-Creation
 * All configured labels are automatically created on startup if they don't exist.
 * Labels are created with appropriate colors:
 * - ready-for-review, review-approved: Green (#0E8A16)
 * - review-in-progress: Yellow (#FBCA04)
 * - review-refactor-required: Red (#D93F0B)
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
   * Label configuration for PR review workflow
   *
   * @optional
   * @defaults shown below
   *
   * Labels track the PR review lifecycle:
   * - `readyForReview`: PRs with this label are queued for review
   * - `reviewInProgress`: Applied during active review
   * - `reviewRefactorRequired`: Applied when review requires changes
   * - `reviewApproved`: Applied when review finds no critical issues
   *
   * Workflow:
   * 1. Add "ready-for-review" to a PR → Review Rock picks it up
   * 2. Label swapped to "review-in-progress" → Prevents duplicate reviews
   * 3. Review generated and analyzed → Determines outcome
   * 4. Final label applied: "review-approved" or "review-refactor-required"
   * 5. On error: Reset to "ready-for-review" for retry
   *
   * Multiple instances coordinate via atomic label swapping—only one instance
   * successfully removes "ready-for-review" and adds "review-in-progress".
   *
   * Custom labels are useful for:
   * - Integrating with existing label workflows
   * - Running multiple bot configurations for different purposes
   * - Custom automation triggers based on review state
   *
   * All labels are auto-created on startup if they don't exist.
   */
  labels: {
    readyForReview: "ready-for-review",
    reviewInProgress: "review-in-progress",
    reviewRefactorRequired: "review-refactor-required",
    reviewApproved: "review-approved",
  },

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
   * Skills determine which Claude skill is used for reviewing each PR type:
   * - `frontend`: Used for PRs that only touch frontend paths
   * - `backend`: Used for PRs that only touch backend code
   * - `mixed`: Used for PRs that touch both frontend and backend
   *
   * Skill names can be:
   * - Built-in skills (e.g., "typescript-expert") - work without installation
   * - Custom skills - must be installed via `claude skill add <skill-url>`
   *
   * Verify installed skills: `claude skill list`
   *
   * Multiple skills:
   * - Comma-separated: "skill1,skill2,skill3"
   * - Skills provide guidance to Claude's /review command
   * - Useful for combining expertise areas (e.g., React + TypeScript)
   *
   * Skill installation (for custom skills):
   * ```bash
   * claude skill add <skill-url>
   * ```
   *
   * Common skills:
   * - typescript-expert: TypeScript type safety and patterns (built-in)
   * - vercel-react-best-practices: React/Next.js performance optimization
   * - contracted: Service-command pattern with @validkeys/contracted
   * - react-doctor: React code quality checks
   * - web-design-guidelines: UI/UX best practices
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

  /**
   * Teams notification configuration for PR review alerts
   *
   * @optional
   *
   * Send Microsoft Teams notifications when PR reviews are completed.
   * Uses adaptive cards with dynamic styling based on review verdict.
   *
   * Setup:
   * 1. Create an Incoming Webhook in your Teams channel
   * 2. Copy the webhook URL
   * 3. Set teamsWebhookUrl to the webhook URL
   * 4. Set enableTeamsNotifications to true
   *
   * Webhook URL format: https://outlook.office.com/webhook/...
   *
   * Card styling by verdict:
   * - Approve ✅: Green card with "PR Review - Approved ✅" title
   * - Request Changes ❌: Red card with "PR Review - Changes Required ❌" title
   * - Comment 💬: Blue card with "PR Review - Comments Posted 💬" title
   *
   * Error handling:
   * - Notification failures are logged but don't stop the review process
   * - Review posting always completes even if notification fails
   *
   * Examples:
   * ```typescript
   * // Disabled (default)
   * {
   *   enableTeamsNotifications: false
   * }
   *
   * // Enabled with webhook URL
   * {
   *   teamsWebhookUrl: "https://outlook.office.com/webhook/...",
   *   enableTeamsNotifications: true
   * }
   * ```
   */
  teamsWebhookUrl: undefined,
  enableTeamsNotifications: false,
};

export default config;
