# Troubleshooting Guide

This guide covers common issues you might encounter when running Review Rock and how to resolve them.

## Table of Contents

- [AWS SSO Token Expired](#aws-sso-token-expired)
- [Skill Not Found](#skill-not-found)
- [GitHub Rate Limit](#github-rate-limit)
- [Multiple Instances Claiming Same PR](#multiple-instances-claiming-same-pr)
- [Command Not Found: review-rock](#command-not-found-review-rock)
- [Command Not Found: gh](#command-not-found-gh)
- [Command Not Found: claudecode](#command-not-found-claudecode)
- [Permission Denied on GitHub](#permission-denied-on-github)
- [Configuration Validation Errors](#configuration-validation-errors)
- [PR Not Being Reviewed](#pr-not-being-reviewed)

---

## AWS SSO Token Expired

### Symptom

```
Error: AWS SSO token expired
Error: Failed to authenticate with AWS Bedrock
```

### Cause

AWS SSO tokens expire after a certain period (typically 1-12 hours depending on your IAM Identity Center configuration). The `claudecode` CLI requires valid AWS credentials to access Claude via AWS Bedrock.

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

The configured skill is not installed in your `claudecode` CLI. Skills must be installed before Review Rock can use them.

### Solution

Install the missing skill:

```bash
claudecode skill add <skill-url>
```

For example:
```bash
claudecode skill add https://github.com/anthropics/claude-code/tree/main/skills/vercel-react-best-practices
```

### Verification

List all installed skills:

```bash
claudecode skill list
```

Ensure all skills referenced in your `review-rock.config.ts` appear in this list.

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

## Multiple Instances Claiming Same PR

### Symptom

Multiple Review Rock instances post duplicate reviews on the same PR.

### Cause

**Race condition** (rare): Two instances checked for claimed PRs at nearly the same time, both found the PR unclaimed, and both claimed it. This should be extremely rare due to GitHub's atomic label operations, but network timing can occasionally cause this.

### Solution

1. **Verify GitHub API behavior**: Check if the PR has multiple claim labels or duplicate comments
2. **Review label operations**: Ensure all instances use the same `claimLabel` configuration
3. **Check timestamps**: If reviews are posted milliseconds apart, it's a race condition

### Mitigation

1. **Add timestamp to claim label** (future enhancement):
   ```typescript
   {
     claimLabel: "review-rock-claimed-<instance-id>"
   }
   ```

2. **Increase polling interval** to reduce likelihood of simultaneous checks:
   ```typescript
   {
     pollingIntervalMinutes: 10
   }
   ```

3. **Use different claim labels** for different instances if running multiple deployments

### Expected Behavior

Under normal operation, GitHub's atomic label operations should prevent race conditions. If you're seeing frequent duplicates, there may be a configuration issue.

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

## Command Not Found: claudecode

### Symptom

```bash
Error: spawn claudecode ENOENT
Error: claudecode command not found
```

### Cause

Claude Code CLI (`claudecode`) is not installed. Review Rock requires `claudecode` to run Claude reviews via AWS Bedrock.

### Solution

Install Claude Code CLI:

1. Visit https://claude.ai/download
2. Download and install the Claude Code CLI for your platform
3. Authenticate with AWS credentials:
   ```bash
   claudecode auth login
   ```

### Alternative: Manual Installation

If the installer isn't available, you can install via npm (if published):
```bash
npm install -g @anthropic-ai/claude-code
```

### Verification

```bash
claudecode --version
# Should output: claudecode version X.X.X
```

Verify AWS authentication:
```bash
claudecode auth status
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

3. **claimLabel**: Must be non-empty string
   ```typescript
   ✅ claimLabel: "review-rock-claimed"
   ❌ claimLabel: ""
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

## PR Not Being Reviewed

### Symptom

Review Rock is running, but certain PRs are not being reviewed.

### Possible Causes & Solutions

1. **PR already claimed**:
   - Check if the PR has the claim label (`review-rock-claimed`)
   - Remove the label to re-trigger review:
     ```bash
     gh pr edit <pr-number> --remove-label "review-rock-claimed"
     ```

2. **PR is closed or merged**:
   - Review Rock only reviews **open** PRs
   - Verify PR status: `gh pr view <pr-number>`

3. **PR is from a fork**:
   - Forked PRs may have different permission requirements
   - Ensure `gh` has access to the base repository

4. **Polling interval**:
   - Review Rock checks every N minutes
   - If you just opened a PR, wait for the next polling cycle

5. **Configuration mismatch**:
   - Verify `repository` in config matches the actual repository
   - Check environment variables aren't overriding config

### Debugging

Enable verbose logging:
```bash
DEBUG=* review-rock
```

This will show:
- When Review Rock polls GitHub
- Which PRs it finds
- Which PRs it attempts to claim
- Any errors during review

### Manual Test

Test if the review workflow works manually:
```bash
# List open PRs
gh pr list --repo owner/repo

# Add claim label
gh pr edit <pr-number> --add-label "review-rock-claimed" --repo owner/repo

# Run Claude review
claudecode --skill typescript-expert "Review this PR"

# Post comment
gh pr comment <pr-number> --body "Review complete" --repo owner/repo
```

If any of these steps fail, that's where the issue lies.

---

## Getting Help

If you're still experiencing issues:

1. **Check the logs**: Review Rock outputs detailed logs that can help identify the problem
2. **Verify prerequisites**: Ensure `gh`, `claudecode`, and AWS credentials are all set up correctly
3. **Test manually**: Run the individual commands (`gh`, `claudecode`) to isolate the issue
4. **Open an issue**: If you believe it's a bug, open an issue on the Review Rock repository with:
   - Full error message
   - Your configuration (redacted)
   - Steps to reproduce

For more help, see the [README](./README.md) or open an issue on GitHub.
