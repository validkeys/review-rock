# Review Rock

> Automated PR review using Claude AI via AWS Bedrock with distributed coordination

## Overview

Review Rock is an intelligent pull request review automation tool that continuously monitors GitHub repositories and performs code reviews using Claude AI through AWS Bedrock (via the `claudecode` CLI). It features distributed coordination to prevent duplicate reviews across multiple instances, intelligent skill routing based on PR changes, and graceful error handling for production use.

## Features

- **Automated PR Monitoring**: Continuously polls GitHub repositories for open PRs
- **Distributed Coordination**: Uses GitHub labels to claim PRs and prevent duplicate reviews across multiple instances
- **Intelligent Classification**: Automatically categorizes PRs as frontend, backend, or mixed based on file paths
- **Skill Selection**: Routes reviews to appropriate Claude skills based on PR classification
- **AWS Bedrock Integration**: Reviews via `claudecode` CLI using Claude Sonnet through AWS Bedrock
- **Error Detection**: Handles AWS SSO token expiry, skill not found errors, and GitHub rate limits
- **Retry Logic**: Exponential backoff for transient failures
- **Effect-TS Architecture**: Built with Effect for type-safe functional programming
- **Structured Logging**: Comprehensive logging using Effect Logger
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
- **Claude Code CLI (`claudecode`)**: Installed and authenticated
  ```bash
  # Install claudecode (see https://claude.ai/download)
  # Authenticate with AWS credentials
  claudecode auth login
  ```
- **AWS Credentials**: Configured for AWS Bedrock access (required by claudecode)

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

Copy the example configuration and customize it:

```bash
cp node_modules/review-rock/review-rock.config.example.ts review-rock.config.ts
```

Edit `review-rock.config.ts`:

```typescript
import { Config } from "review-rock";

export default Config.make({
  repository: "your-org/your-repo",
  pollingIntervalMinutes: 5,
  claimLabel: "review-rock-claimed",
  frontendPaths: ["apps/frontend", "packages/ui", "src/components"],
  skills: {
    frontend: "vercel-react-best-practices",
    backend: "typescript-expert",
    mixed: "vercel-react-best-practices,typescript-expert"
  }
});
```

### 2. Install Claude Skills

Install the skills you configured:

```bash
claudecode skill add <skill-url>
```

Verify skills are installed:

```bash
claudecode skill list
```

### 3. Run Review Rock

Start monitoring your repository:

```bash
review-rock your-org/your-repo
```

Or use the configuration file:

```bash
review-rock
```

Review Rock will:
1. Poll for open PRs every 5 minutes
2. Claim unclaimed PRs by adding the claim label
3. Classify PRs based on file paths
4. Select appropriate skills
5. Run Claude review via `claudecode`
6. Post review comments to GitHub

## Configuration

### Configuration File

The `review-rock.config.ts` file supports the following options:

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `repository` | `string` | Yes | - | GitHub repository in `owner/repo` format |
| `pollingIntervalMinutes` | `number` | No | `5` | How often to check for new PRs (in minutes) |
| `claimLabel` | `string` | No | `"review-rock-claimed"` | Label used to mark claimed PRs |
| `frontendPaths` | `string[]` | No | `[]` | Path patterns for frontend files (e.g., `["apps/frontend", "lib/ui"]`) |
| `skills.frontend` | `string` | Yes | - | Skill(s) for frontend PRs (comma-separated for multiple) |
| `skills.backend` | `string` | Yes | - | Skill(s) for backend PRs |
| `skills.mixed` | `string` | Yes | - | Skill(s) for mixed PRs |

### Environment Variables

Override configuration with environment variables:

```bash
export REVIEW_ROCK_REPOSITORY="owner/repo"
export REVIEW_ROCK_POLLING_INTERVAL="10"
export REVIEW_ROCK_CLAIM_LABEL="my-bot-claimed"
```

## How It Works

Review Rock follows this workflow:

1. **Polling**: Checks GitHub every N minutes for open PRs
2. **Claiming**: Adds claim label atomically to prevent race conditions
3. **Classification**: Analyzes changed files to determine PR type:
   - **Frontend**: All changes in `frontendPaths`
   - **Backend**: No changes in `frontendPaths`
   - **Mixed**: Changes in both frontend and backend paths
4. **Review**: Executes `claudecode` with selected skill(s)
5. **Comment**: Posts Claude's review as a PR comment via `gh`

Multiple instances coordinate through GitHub labels—only one instance claims each PR.

## Troubleshooting

For common issues and solutions, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

Common problems:
- **AWS SSO Token Expired**: Run `aws sso login` to refresh
- **Skill Not Found**: Install skill with `claudecode skill add <skill-url>`
- **GitHub Rate Limit**: Use authenticated `gh` CLI or reduce polling frequency
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

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT
