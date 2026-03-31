# Changelog

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

[0.1.0]: https://github.com/yourusername/review-rock/releases/tag/v0.1.0
