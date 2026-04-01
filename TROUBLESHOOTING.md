# Troubleshooting Guide

This guide covers common issues you might encounter when running Review Rock and how to resolve them.

## Table of Contents

- [No PRs Being Processed](#no-prs-being-processed)
- [PR Stuck in "review-in-progress"](#pr-stuck-in-review-in-progress)
- [Labels Not Appearing on GitHub](#labels-not-appearing-on-github)
- [AWS SSO Token Expired](#aws-sso-token-expired)
- [Skill Not Found](#skill-not-found)
- [GitHub Rate Limit](#github-rate-limit)
- [Command Not Found: review-rock](#command-not-found-review-rock)
- [Command Not Found: gh](#command-not-found-gh)
- [Command Not Found: claude](#command-not-found-claude)
- [Permission Denied on GitHub](#permission-denied-on-github)
- [Configuration Validation Errors](#configuration-validation-errors)

---

## No PRs Being Processed

### Symptom

Review Rock is running but not reviewing any PRs.

### Cause

PRs don't have the `ready-for-review` label (or your configured label).

### Solution

1. **Add the label to PRs you want reviewed**:
   ```bash
   gh pr edit <pr-number> --add-label "ready-for-review" --repo owner/repo
   ```

2. **Check your configuration**:
   Verify the label name in `review-rock.config.ts`:
   ```typescript
   labels: {
     readyForReview: "ready-for-review",  // Must match the label on PRs
     // ...
   }
   ```

3. **Check polling logs**:
   Look for messages like:
   ```
   Found 0 ready PRs out of X total
   ```
   This confirms Review Rock is running but no PRs have the required label.

### Verification

List PRs with the label:
```bash
gh pr list --label "ready-for-review" --repo owner/repo
```

---

## PR Stuck in "review-in-progress"

### Symptom

A PR has the `review-in-progress` label but no review comment, and Review Rock isn't retrying.

### Cause

The review process failed partway through (network error, Claude timeout, etc.) and the label wasn't reset.

### Solution

1. **Check logs** for error messages about the PR
2. **Manually reset the label**:
   ```bash
   # Remove in-progress label
   gh pr edit <pr-number> --remove-label "review-in-progress" --repo owner/repo

   # Re-add ready-for-review label
   gh pr edit <pr-number> --add-label "ready-for-review" --repo owner/repo
   ```

3. **Wait for next polling cycle** (or restart Review Rock)

### Prevention

Review Rock automatically resets labels on error, but if the process crashes or is forcefully killed, labels may be orphaned. Consider running Review Rock as a service with automatic restart.

---

## Labels Not Appearing on GitHub

### Symptom

Review Rock logs show labels being added/removed, but they don't appear on GitHub.

### Cause

1. Labels don't exist in the repository
2. GitHub permissions issue
3. `gh` CLI not authenticated

### Solution

1. **Check if labels exist**:
   ```bash
   gh label list --repo owner/repo | grep review
   ```

2. **Review Rock auto-creates labels on startup**. Check logs for:
   ```
   ✓ Created label 'ready-for-review'
   ✓ Label 'review-in-progress' already exists
   ```

3. **Manually create labels** if needed:
   ```bash
   gh label create "ready-for-review" --color "0E8A16" --description "PR is ready for automated review" --repo owner/repo
   gh label create "review-in-progress" --color "FBCA04" --description "Review is currently in progress" --repo owner/repo
   gh label create "review-approved" --color "0E8A16" --description "Review has been approved" --repo owner/repo
   gh label create "review-refactor-required" --color "D93F0B" --description "Review requires changes" --repo owner/repo
   ```

4. **Verify `gh` permissions**:
   ```bash
   gh auth status
   ```
   Ensure you have `repo` scope.

---

## AWS SSO Token Expired

### Symptom

```
Error: AWS SSO token expired
Error: Failed to authenticate with AWS Bedrock
```

### Cause

AWS SSO tokens expire after a certain period (typically 1-12 hours depending on your IAM Identity Center configuration). If you're using Claude via AWS Bedrock, the `claude` CLI requires valid AWS credentials.

### Solution

Refresh your AWS SSO session:

```bash
aws sso login
```

If you're using a specific profile:

```bash
aws sso login --profile your-profile
```

### Prevention

1. **Set up longer session durations** in AWS IAM Identity Center (if you have permissions):
   - Navigate to AWS IAM Identity Center console
   - Go to Settings → Session settings
   - Increase the session duration (up to 12 hours)

2. **Automate token refresh** by creating a cron job or scheduled task:
   ```bash
   # Add to crontab (runs every 8 hours)
   0 */8 * * * aws sso login --profile your-profile
   ```

3. **Use AWS credentials instead of SSO** if you need longer-lived credentials (not recommended for production):
   ```bash
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   ```

### Verification

Check if AWS credentials are valid:

```bash
aws sts get-caller-identity
```

If successful, you'll see your AWS account details.

---

## Skill Not Found

### Symptom

```
Error: Skill 'vercel-react-best-practices' not found
Error: Could not find skill in claudecode
```

### Cause

The configured skill is not installed in your `claude` CLI. Skills must be installed before Review Rock can use them, or the skill name is incorrect.

### Solution

1. **Install the missing skill**:
   ```bash
   claude skill add <skill-url>
   ```

   For example:
   ```bash
   claude skill add https://github.com/anthropics/claude-code-skills/tree/main/vercel-react-best-practices
   ```

2. **Or use built-in skills** like `typescript-expert` which don't require installation

### Verification

List all installed skills:

```bash
claude skill list
```

Ensure all skills referenced in your `review-rock.config.ts` appear in this list, or use built-in skill names.

### Common Skills

Here are URLs for commonly used skills:

- **vercel-react-best-practices**: React/Next.js performance optimization
- **typescript-expert**: TypeScript type safety and patterns
- **contracted**: Service-command pattern with @validkeys/contracted
- **react-doctor**: React code quality checks
- **web-design-guidelines**: UI/UX best practices

For the complete skill catalog, visit: https://github.com/anthropics/claude-code/tree/main/skills

---

## GitHub Rate Limit

### Symptom

```
Error: API rate limit exceeded for user
Error: You have exceeded a secondary rate limit
```

### Cause

GitHub enforces rate limits on API requests:
- **Unauthenticated**: 60 requests per hour per IP
- **Authenticated**: 5000 requests per hour per user
- **Secondary limits**: Triggered by too many concurrent requests

Review Rock polls GitHub periodically, and with frequent polling intervals, you may hit these limits.

### Solution

1. **Ensure `gh` CLI is authenticated** (for higher limits):
   ```bash
   gh auth login
   gh auth status
   ```

2. **Reduce polling frequency** in your configuration:
   ```typescript
   {
     pollingIntervalMinutes: 10  // Instead of 5
   }
   ```

3. **Wait for rate limit reset**:
   - Check when your rate limit resets:
     ```bash
     gh api rate_limit
     ```
   - Rate limits reset every hour

### Prevention

- Use authenticated `gh` CLI (5000 req/hour vs 60 req/hour)
- Set appropriate polling intervals (5-15 minutes recommended)
- Avoid running multiple Review Rock instances on the same GitHub account

### Verification

Check your current rate limit status:

```bash
gh api rate_limit --jq '.rate'
```

---

## Command Not Found: review-rock

### Symptom

```bash
$ review-rock
command not found: review-rock
```

### Cause

The `review-rock` command is not in your system's PATH. This typically happens when:
- Review Rock wasn't installed globally
- pnpm's global bin directory is not in PATH

### Solution

**Option 1: Add pnpm bin to PATH**

Find pnpm's global bin directory:
```bash
pnpm bin -g
```

Add it to your PATH:
```bash
# For bash (~/.bashrc)
export PATH="$(pnpm bin -g):$PATH"

# For zsh (~/.zshrc)
export PATH="$(pnpm bin -g):$PATH"
```

Reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

**Option 2: Use pnpm exec**

Run Review Rock via pnpm:
```bash
pnpm exec review-rock your-org/your-repo
```

**Option 3: Install globally**

Ensure Review Rock is installed globally:
```bash
pnpm install -g review-rock
```

### Verification

```bash
which review-rock
# Should output: /path/to/pnpm/global/bin/review-rock
```

---

## Command Not Found: gh

### Symptom

```bash
Error: spawn gh ENOENT
Error: gh command not found
```

### Cause

GitHub CLI (`gh`) is not installed. Review Rock requires `gh` to interact with GitHub (list PRs, add labels, post comments).

### Solution

Install GitHub CLI:

**macOS:**
```bash
brew install gh
```

**Linux:**
```bash
# Debian/Ubuntu
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

**Windows:**
```powershell
winget install --id GitHub.cli
```

For other platforms, see: https://cli.github.com/

### Post-Installation

Authenticate with GitHub:
```bash
gh auth login
```

### Verification

```bash
gh --version
# Should output: gh version X.X.X
```

---

## Command Not Found: claude

### Symptom

```bash
Error: spawn claude ENOENT
Error: claude command not found
```

### Cause

Claude CLI (`claude`) is not installed. Review Rock requires `claude` to run Claude reviews using the `/review` command.

### Solution

Install Claude CLI:

1. Visit https://claude.ai/download
2. Download and install Claude for your platform
3. Run Claude once to authenticate:
   ```bash
   claude
   ```
   Follow the authentication prompts.

### Verification

```bash
claude --version
# Should output: claude version X.X.X
```

Test Claude is working:
```bash
echo "Hello" | claude
```

---

## Permission Denied on GitHub

### Symptom

```
Error: Resource not accessible by personal access token
Error: Must have push access to repository
```

### Cause

The authenticated GitHub user lacks sufficient permissions to:
- Read pull requests
- Add labels
- Post comments

### Solution

1. **Re-authenticate with `gh` CLI**:
   ```bash
   gh auth logout
   gh auth login
   ```

   When prompted, ensure you grant these scopes:
   - `repo` (full repository access)
   - `write:discussion` (comment on PRs)

2. **Verify repository access**:
   ```bash
   gh repo view owner/repo
   ```

   If this fails, you don't have access to the repository.

3. **Check permissions**:
   - You need **write** access to add labels and post comments
   - Contact the repository owner to grant you access

### Verification

Test if you can post a comment:
```bash
gh pr comment <pr-number> --body "Test comment" --repo owner/repo
```

If successful, Review Rock should work.

---

## Configuration Validation Errors

### Symptom

```
Error: Configuration validation failed
Error: Invalid configuration: pollingIntervalMinutes must be > 0
```

### Cause

Your `review-rock.config.ts` file contains invalid configuration values.

### Solution

Check common validation rules:

1. **repository**: Must be in "owner/repo" format
   ```typescript
   ✅ repository: "facebook/react"
   ❌ repository: "facebook-react"
   ❌ repository: "facebook"
   ```

2. **pollingIntervalMinutes**: Must be > 0
   ```typescript
   ✅ pollingIntervalMinutes: 5
   ❌ pollingIntervalMinutes: 0
   ❌ pollingIntervalMinutes: -1
   ```

3. **labels**: All label fields must be non-empty strings
   ```typescript
   ✅ labels: {
     readyForReview: "ready-for-review",
     reviewInProgress: "review-in-progress",
     reviewRefactorRequired: "review-refactor-required",
     reviewApproved: "review-approved"
   }
   ❌ labels: {
     readyForReview: "",  // Empty string not allowed
     // ...
   }
   ```

4. **frontendPaths**: Must be array of strings
   ```typescript
   ✅ frontendPaths: ["apps/frontend"]
   ✅ frontendPaths: []
   ❌ frontendPaths: "apps/frontend"
   ```

5. **skills**: All fields (frontend, backend, mixed) are required
   ```typescript
   ✅ skills: {
     frontend: "skill1",
     backend: "skill2",
     mixed: "skill1,skill2"
   }
   ❌ skills: {
     frontend: "skill1"
     // Missing backend and mixed
   }
   ```

### Verification

Run Review Rock and check for validation errors:
```bash
review-rock
```

If the configuration is valid, Review Rock will start polling.

---

## Getting Help

If you're still experiencing issues:

1. **Check the logs**: Review Rock outputs detailed structured logs with PR numbers that help identify the problem
2. **Verify prerequisites**: Ensure `gh` and `claude` CLIs are installed and authenticated
3. **Check labels**: Verify PRs have the `ready-for-review` label and labels aren't stuck
4. **Test manually**: Run individual commands (`gh pr list`, `claude`, etc.) to isolate the issue
5. **Open an issue**: If you believe it's a bug, open an issue on the Review Rock repository with:
   - Full error message and logs
   - Your configuration (redacted)
   - Steps to reproduce
   - PR number if applicable

For more help, see the [README](./README.md) or open an issue on GitHub.
