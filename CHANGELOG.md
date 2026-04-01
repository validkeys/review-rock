# Changelog

## 0.2.0

### Minor Changes

- Refactored the resilience

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-31

### Added

- Initial release of Review Rock
- Automated PR review using Claude via AWS Bedrock
- GitHub polling with configurable intervals (default: 5 minutes)
- Distributed coordination via GitHub labels to prevent duplicate reviews
- PR classification (frontend/backend/mixed) based on file paths
- Skill selection based on PR type with support for multiple skills
- AWS SSO token expiry detection and error handling
- Skill not found error detection with actionable error messages
- GitHub rate limit detection and handling
- Retry logic with exponential backoff for transient failures
- Structured logging with Effect Logger
- Effect-TS service architecture with dependency injection
- CLI tool for running Review Rock with repository argument
- Configuration file support (`review-rock.config.ts`)
- Environment variable overrides for configuration
- Type-safe configuration with Effect Schema validation
- GitHub CLI (`gh`) integration for PR operations
- Claude Code CLI (`claudecode`) integration for reviews
- Comprehensive test suite with 81%+ coverage
- Integration tests for GitHub CLI operations
- Error scenario tests for edge cases
- Concurrent instance coordination tests
- E2E smoke test documentation

### Documentation

- Comprehensive README with installation, quick start, and configuration guide
- Detailed configuration documentation with JSDoc comments
- Troubleshooting guide for common issues
- Code coverage reports with 80% threshold
- Smoke test documentation for manual testing

### Technical Details

**Core Services:**

- `GitHubService`: PR listing, label management, comment posting
- `ReviewService`: Claude review orchestration via claudecode
- `ClassificationService`: PR type detection based on file paths
- `ConfigService`: Configuration loading with validation
- `PollingService`: Periodic GitHub polling with error handling
- `WorkflowService`: End-to-end PR review workflow

**Error Handling:**

- AWS SSO token expiration detection
- Skill not found error detection
- GitHub API rate limit handling
- Retry logic with exponential backoff (3 retries, 1s/2s/4s delays)
- Graceful degradation for network failures

**Testing:**

- Unit tests for all core services
- Integration tests with GitHub CLI
- Error scenario tests
- Concurrent instance tests
- 81.74% code coverage (exceeds 80% target)
- 81 passing tests across 12 test files

### Known Limitations

- No Microsoft Teams notifications (planned for future release)
- No web UI or dashboard (planned for future release)
- No persistent state—all coordination is ephemeral via GitHub labels
- No PR reopening detection—manually remove claim label to re-review
- No configuration hot-reloading—restart required for config changes
- Single repository monitoring per instance—run multiple instances for multiple repos

### Dependencies

**Runtime:**

- `effect` ^3.10.0 - Functional effect system
- `@effect/cli` ^0.47.0 - CLI framework
- `@effect/platform` ^0.68.0 - Platform abstractions
- `@effect/platform-node` ^0.63.0 - Node.js runtime
- `@effect/schema` ^0.75.0 - Schema validation

**Development:**

- `typescript` ^5.6.0
- `vitest` ^2.1.9 - Test framework
- `@vitest/coverage-v8` ^2.1.9 - Coverage reporting
- `@effect/vitest` ^0.12.0 - Effect testing utilities
- `@biomejs/biome` ^1.9.0 - Linting and formatting
- `tsx` ^4.19.0 - TypeScript execution

**External Tools:**

- GitHub CLI (`gh`) - Required for GitHub API operations
- Claude Code CLI (`claudecode`) - Required for Claude AI reviews
- AWS CLI (optional) - For AWS SSO authentication

### Breaking Changes

None - this is the initial release.

### Migration Guide

Not applicable - this is the initial release.

---

## [0.2.0] - 2026-03-31

### Added

**Label-Based Workflow:**

- Label-based state machine for PR review lifecycle
- Four workflow labels: `ready-for-review`, `review-in-progress`, `review-refactor-required`, `review-approved`
- Automatic label creation on startup with appropriate colors and descriptions
- Atomic label swapping for distributed coordination (no race conditions)
- Only PRs with `ready-for-review` label are queued for review

**Automatic Retry & Resilience:**

- Intelligent retry logic for transient failures (network issues, token expiry, rate limits)
- Network operations: 5 retries with exponential backoff (5s → 10s → 20s → 40s → 80s)
- Review generation: 10 retries with exponential backoff (10s → 20s → 40s → 80s → 160s...)
- Automatic handling of computer sleep and network interruptions
- Graceful AWS SSO token expiry handling with automatic resume after refresh
- PR stays in `review-in-progress` during all retries
- Only resets to `ready-for-review` after all retries exhausted

**Enhanced Review Experience:**

- Initial "🤖 analyzing..." comment posted immediately when PR is claimed
- Same comment updated with full review when complete (no multiple comments)
- Automated outcome determination from review content (approved vs refactor-required)
- Final label automatically applied based on review analysis

**Improved Logging:**

- Migrated to Effect's structured logging system with pretty formatting
- PR number annotations on all workflow logs for traceability
- Log levels: INFO, WARN, ERROR, DEBUG with color-coded output
- Retry attempts logged with clear context
- Transient vs permanent error distinction in logs

**Claude Integration:**

- Uses Claude's built-in `/review` command instead of passing full diffs
- Claude fetches PR diff directly via GitHub CLI (reduces data transfer)
- Skill-specific guidance provided based on PR classification
- Concise review format with severity markers (🔴 Critical, 🟡 Warning, 🔵 Suggestion)

### Changed

**Breaking Changes:**

- Configuration schema updated: `claimLabel` replaced with `labels` object
- Now uses `claude` CLI instead of `claudecode` CLI
- Configuration must be updated to use new labels structure:

  ```typescript
  // Old
  claimLabel: "review-rock-claimed"

  // New
  labels: {
    readyForReview: "ready-for-review",
    reviewInProgress: "review-in-progress",
    reviewRefactorRequired: "review-refactor-required",
    reviewApproved: "review-approved"
  }
  ```

**Workflow Changes:**

- Reviews now triggered by `ready-for-review` label instead of absence of claim label
- Labels swapped atomically (remove ready → add in-progress) instead of just adding claim label
- Comment posting strategy changed to update single comment instead of posting new ones
- Review generation now uses `/review` command with skill guidance instead of direct skill execution

**Performance Improvements:**

- Parallel label creation on startup (all 4 labels created concurrently)
- Reduced diff data transfer (Claude fetches diffs itself)
- More efficient GitHub API usage with targeted operations

### Fixed

- Race conditions in distributed coordination via atomic label swapping
- Duplicate reviews from multiple instances
- PRs getting stuck in claimed state after errors
- Network interruptions causing permanent failures
- Token expiry requiring manual restart
- Labels not appearing on GitHub (auto-creation on startup)
- Missing context in review requests (now uses /review with full context)

### Documentation

- Complete rewrite of README.md for label-based workflow
- New "Resilience & Error Handling" section in README
- Updated TROUBLESHOOTING.md with automatic retry behavior
- New "Computer Sleep / Network Interruption" troubleshooting section
- Updated "AWS SSO Token Expired" with automatic handling instructions
- Updated example configuration file with labels and workflow explanation
- All code examples updated to use new configuration structure

### Technical Details

**Architecture Changes:**

- Label-based state machine replaces claim label pattern
- Retry schedules implemented with Effect Schedule combinators
- Transient error detection with pattern matching
- Single comment ID tracked throughout workflow for updates

**Error Classification:**

- Transient errors: Network failures, token expiry, rate limits, timeouts
- Permanent errors: Skill not found, invalid config, permission denied
- Automatic retry only for transient errors

**Review Generation:**

- Command: `claude --bare --allowed-tools Bash(gh:*)`
- Input: `/review <pr-number>` with skill guidance and format requirements
- Skill guidance varies by classification (frontend/backend/mixed)
- Review text analyzed for outcome (critical issues, explicit verdicts)

**Label Colors:**

- `ready-for-review`: Green (#0E8A16)
- `review-in-progress`: Yellow (#FBCA04)
- `review-refactor-required`: Red (#D93F0B)
- `review-approved`: Green (#0E8A16)

### Migration Guide

**1. Update Configuration File:**

```typescript
// Old configuration
const config: Config = {
  repository: "owner/repo",
  pollingIntervalMinutes: 5,
  claimLabel: "review-rock-claimed",  // ❌ Remove this
  frontendPaths: ["apps/frontend"],
  skills: { ... }
};

// New configuration
const config: Config = {
  repository: "owner/repo",
  pollingIntervalMinutes: 5,
  labels: {  // ✅ Add this
    readyForReview: "ready-for-review",
    reviewInProgress: "review-in-progress",
    reviewRefactorRequired: "review-refactor-required",
    reviewApproved: "review-approved"
  },
  frontendPaths: ["apps/frontend"],
  skills: { ... }
};
```

**2. Install Claude CLI:**

Replace `claudecode` with `claude`:

```bash
# Install claude from https://claude.ai/download
# Authenticate on first run
claude
```

**3. Add Labels to PRs:**

PRs now require the `ready-for-review` label to be queued:

```bash
gh pr edit <pr-number> --add-label "ready-for-review"
```

**4. Remove Old Labels:**

Remove old claim labels if they exist:

```bash
gh label delete "review-rock-claimed" --repo owner/repo
```

**5. Restart Review Rock:**

Labels will be auto-created on next startup.

### Known Limitations

- No Microsoft Teams notifications (planned for future release)
- No web UI or dashboard (planned for future release)
- No persistent state—all coordination is ephemeral via GitHub labels
- No configuration hot-reloading—restart required for config changes
- Single repository monitoring per instance—run multiple instances for multiple repos
- Review outcome determination is text-based (may misclassify ambiguous reviews)

### Dependencies

**Changed:**

- Now requires `claude` CLI instead of `claudecode` CLI

**Runtime:** (unchanged)

- `effect` ^3.10.0
- `@effect/cli` ^0.47.0
- `@effect/platform` ^0.68.0
- `@effect/platform-node` ^0.63.0
- `@effect/schema` ^0.75.0

**External Tools:**

- GitHub CLI (`gh`) - Required
- Claude CLI (`claude`) - Required (changed from `claudecode`)
- AWS CLI (optional) - For AWS SSO authentication

---

## [Unreleased]

### Planned Features

- Microsoft Teams notification integration
- Web UI for monitoring and configuration
- Persistent state storage (database or file-based)
- Multi-repository monitoring in a single instance
- PR reopening detection for automatic re-review
- Configuration hot-reloading without restart
- Webhook support for instant PR notifications (instead of polling)
- Custom review templates
- Review approval/rejection workflow
- Metrics and analytics dashboard

---

[0.1.0]: https://github.com/validkeys/review-rock/releases/tag/v0.1.0
