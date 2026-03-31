# Review Rock

Automated pull request review system using Claude via CLI with distributed coordination.

## Overview

Review Rock is an intelligent PR review automation tool that monitors GitHub repositories and performs code reviews using Claude AI through the Claude CLI. It features distributed coordination to prevent duplicate reviews and intelligent skill routing based on the changes in each PR.

## Status

🚧 **In Development** - Project Foundation milestone in progress

## Features (Planned)

- Automated PR monitoring and claiming
- Distributed coordination with GitHub labels
- Intelligent skill routing (frontend, backend, mixed)
- Effect-TS based functional architecture
- Type-safe configuration with Effect Schema

## Installation

*Installation instructions will be added in a future milestone.*

## Usage

*Usage documentation will be added in a future milestone.*

## Configuration

Copy `review-rock.config.example.ts` to `review-rock.config.ts` and customize for your repository:

```typescript
{
  repository: "owner/repo",
  pollingIntervalMinutes: 5,
  claimLabel: "review-rock-claimed",
  frontendPaths: ["apps/frontend", "lib/ui"],
  skills: {
    frontend: "vercel-react-best-practices",
    backend: "typescript-expert",
    mixed: "vercel-react-best-practices,typescript-expert"
  }
}
```

## Development

```bash
# Install dependencies
pnpm install

# Run type checking
pnpm run typecheck

# Run tests
pnpm test

# Run linting
pnpm run lint
```

## License

MIT
