# Review Rock

> Automated PR review using Claude AI with label-based workflow and intelligent outcome determination

## Overview

Review Rock is an intelligent pull request review automation tool that continuously monitors GitHub repositories and performs code reviews using Claude AI (via the `claude` CLI). It features a label-based state machine for coordinating reviews, intelligent skill routing based on PR changes, automated review outcome determination, and graceful error handling for production use.

## Features

- **Label-Based Workflow**: Uses GitHub labels to track PR review state (ready → in-progress → approved/refactor-required)
- **Automated PR Monitoring**: Continuously polls GitHub repositories for PRs marked "ready-for-review"
- **Distributed Coordination**: Multiple instances safely coordinate via label swapping to prevent race conditions
- **Intelligent Classification**: Automatically categorizes PRs as frontend, backend, or mixed based on file paths
- **Skill Selection**: Routes reviews to appropriate Claude skills based on PR classification
- **Claude /review Integration**: Uses Claude's built-in `/review` command for comprehensive PR analysis
- **Automated Outcome Determination**: Analyzes review content to determine "approved" vs "refactor-required"
- **Real-time Status Updates**: Posts initial "analyzing..." comment, then updates with review results
- **Error Recovery**: Automatically resets labels to "ready-for-review" on failure for retry
- **Effect-TS Architecture**: Built with Effect for type-safe functional programming
- **Structured Logging**: Comprehensive logging with PR number annotations using Effect Logger
- **Test Coverage**: 81%+ test coverage with integration and unit tests

## Prerequisites

Before installing Review Rock, ensure you have:

- **Node.js** ≥18.0.0
- **pnpm** ≥8.0.0
- **GitHub CLI (`gh`)**: Installed and authenticated
  ```bash
  # Install gh from https://cli.github.com/
  gh auth login
  ```
- **Claude CLI (`claude`)**: Installed and authenticated
  ```bash
  # Install claude from https://claude.ai/download
  # Authenticate (follow prompts on first run)
  claude
  ```
- **AWS Credentials** (if using AWS Bedrock): Some Claude configurations use AWS Bedrock
  ```bash
  aws sso login  # if needed for your Claude setup
  ```

## Installation

Install Review Rock globally using pnpm:

```bash
pnpm install -g review-rock
```

Or run it locally in your project:

```bash
pnpm install review-rock
```

## Quick Start

### 1. Create Configuration

Create a `review-rock.config.ts` file in your project root:

```typescript
import type { Config } from "review-rock";

const config: Config = {
  repository: "your-org/your-repo",
  pollingIntervalMinutes: 5,
  labels: {
    readyForReview: "ready-for-review",
    reviewInProgress: "review-in-progress",
    reviewRefactorRequired: "review-refactor-required",
    reviewApproved: "review-approved",
  },
  frontendPaths: ["apps/frontend", "packages/ui", "src/components"],
  skills: {
    frontend: "vercel-react-best-practices",
    backend: "typescript-expert",
    mixed: "vercel-react-best-practices,typescript-expert",
  },
};

export default config;
```

### 2. Install Claude Skills (Optional)

If using custom skills, install them:

```bash
claude skill add <skill-url>
```

Verify skills are installed:

```bash
claude skill list
```

### 3. Add "ready-for-review" Label to PRs

Add the `ready-for-review` label (or your configured label) to any PR you want reviewed. Review Rock will automatically process all PRs with this label.

### 4. Run Review Rock

Start monitoring your repository from the directory containing `review-rock.config.ts`:

```bash
review-rock
```

Review Rock will:
1. Auto-create all workflow labels if they don't exist
2. Poll for PRs with the "ready-for-review" label every 5 minutes
3. Remove "ready-for-review" and add "review-in-progress" label
4. Post "🤖 analyzing..." comment to the PR
5. Classify PR based on changed files (frontend/backend/mixed)
6. Select appropriate skill(s) based on classification
7. Run Claude's `/review` command (Claude fetches the diff itself)
8. Analyze review to determine outcome (approved vs refactor-required)
9. Update comment with full review
10. Remove "review-in-progress" and add final label ("review-approved" or "review-refactor-required")

## Configuration

### Configuration File

The `review-rock.config.ts` file supports the following options:

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `repository` | `string` | Yes | - | GitHub repository in `owner/repo` format |
| `pollingIntervalMinutes` | `number` | No | `5` | How often to check for new PRs (in minutes) |
| `labels.readyForReview` | `string` | No | `"ready-for-review"` | Label that marks PRs eligible for review |
| `labels.reviewInProgress` | `string` | No | `"review-in-progress"` | Label added during active review |
| `labels.reviewRefactorRequired` | `string` | No | `"review-refactor-required"` | Label added when changes are required |
| `labels.reviewApproved` | `string` | No | `"review-approved"` | Label added when PR is approved |
| `frontendPaths` | `string[]` | No | `[]` | Path patterns for frontend files (e.g., `["apps/frontend", "lib/ui"]`) |
| `skills.frontend` | `string` | Yes | - | Skill(s) for frontend PRs (comma-separated for multiple) |
| `skills.backend` | `string` | Yes | - | Skill(s) for backend PRs |
| `skills.mixed` | `string` | Yes | - | Skill(s) for mixed PRs |

### Label Workflow

Labels track the PR review lifecycle:

```
ready-for-review → review-in-progress → review-approved
                                     ↘ review-refactor-required
```

- **On error**: `review-in-progress` is removed and `ready-for-review` is re-added for retry
- **Multiple instances**: Safe coordination via atomic label swapping
- **Auto-creation**: All labels are created on startup if they don't exist

## How It Works

Review Rock follows a label-based state machine workflow:

1. **Polling**: Checks GitHub every N minutes for PRs with `ready-for-review` label
2. **Label Swap**: Atomically removes `ready-for-review` and adds `review-in-progress` to claim the PR
3. **Initial Comment**: Posts "🤖 analyzing..." comment with comment ID
4. **Classification**: Analyzes changed files to determine PR type:
   - **Frontend**: All changes in `frontendPaths`
   - **Backend**: No changes in `frontendPaths`
   - **Mixed**: Changes in both frontend and backend paths
5. **Skill Selection**: Chooses skill(s) based on classification (frontend/backend/mixed)
6. **Review Generation**: Executes Claude's `/review` command with skill-specific guidance
   - Claude fetches the PR diff itself via GitHub CLI
   - Generates concise review with severity markers (🔴 Critical, 🟡 Warning, 🔵 Suggestion)
7. **Outcome Determination**: Analyzes review text for:
   - Explicit verdict (Approve ✅ / Request Changes ❌)
   - Critical issues (🔴)
   - Defaults to "refactor-required" for safety
8. **Comment Update**: Updates the initial comment with full review content
9. **Final Label**: Removes `review-in-progress`, adds `review-approved` or `review-refactor-required`
10. **Error Handling**: On failure, updates comment with error, resets to `ready-for-review`

Multiple instances coordinate through label swapping—only one instance successfully claims each PR.

## Troubleshooting

For common issues and solutions, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

Common problems:
- **No PRs being processed**: Ensure PRs have the `ready-for-review` label (or your configured label)
- **PR stuck in "review-in-progress"**: Check logs for errors; manually remove label to retry
- **AWS SSO Token Expired**: Run `aws sso login` to refresh (if using AWS Bedrock)
- **Skill Not Found**: Install skill with `claude skill add <skill-url>` or use built-in skills
- **GitHub Rate Limit**: Use authenticated `gh` CLI or reduce polling frequency
- **Labels not appearing**: Check `gh` permissions; labels are auto-created on startup
- **Command Not Found**: Ensure `pnpm` global bin is in your PATH

## Development

### Install Dependencies

```bash
pnpm install
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Type Checking & Linting

```bash
# Type check
pnpm run typecheck

# Lint code
pnpm run lint

# Fix lint issues
pnpm run lint:fix
```

### Build

```bash
pnpm run build
```

## Project Structure

```
review-rock/
├── src/
│   ├── services/        # Effect services (Review, Classification, etc.)
│   ├── config.ts        # Configuration schema
│   ├── main.ts          # CLI entry point
│   └── index.ts         # Public API
├── tests/
│   ├── integration/     # Integration tests
│   ├── error-scenarios/ # Error handling tests
│   └── e2e/            # End-to-end tests
├── scripts/            # Utility scripts
└── review-rock.config.example.ts
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass: `pnpm test`
5. Submit a pull request

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) for version management and changelogs.

### Workflow

1. **Add a changeset** after merging a PR that changes behavior:
   ```bash
   pnpm changeset
   ```
   This prompts for the version bump type (patch/minor/major) and a summary.

2. **Consume changesets** when ready to release:
   ```bash
   pnpm version-packages
   ```
   This bumps `package.json` versions and updates `CHANGELOG.md`.

3. **Publish to npm**:
   ```bash
   pnpm release
   ```
   This builds, runs tests, and publishes to npm.

4. **Tag and push**:
   ```bash
   git push --follow-tags
   gh release create v<version> --title "v<version>" --notes-file CHANGELOG.md
   ```

### Pre-release versions

```bash
# Add a changeset, edit the version in .changeset/*.md to include e.g. 0.2.0-beta.1
pnpm version-packages
pnpm changeset publish --tag beta
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT
