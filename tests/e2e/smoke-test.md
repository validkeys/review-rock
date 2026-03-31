# Review Rock - End-to-End Smoke Test

This document provides a manual smoke test plan for validating the complete Review Rock workflow from polling to comment posting.

## Prerequisites

Before running the smoke test, ensure the following are configured:

### 1. GitHub CLI (gh)
```bash
# Check if gh CLI is installed
gh --version

# Authenticate with GitHub (if not already)
gh auth login

# Verify authentication
gh auth status
```

### 2. AWS Bedrock Access
```bash
# Verify AWS credentials are configured
aws sts get-caller-identity

# Test Bedrock access (optional)
aws bedrock list-foundation-models --region us-west-2
```

### 3. Review Rock Installation
```bash
# Install Review Rock globally
pnpm install -g .

# Verify installation
review-rock --version
```

### 4. Test Repository
You'll need a GitHub repository where you have write access to:
- Create pull requests
- Add/remove labels
- Post comments

**Recommended:** Create a dedicated test repository (e.g., `yourname/review-rock-test`)

## Test Setup

### Step 1: Create Test Configuration

Create a test configuration file `review-rock.test.config.json`:

```json
{
  "repository": "yourname/review-rock-test",
  "pollingIntervalMinutes": 1,
  "claimLabel": "review-rock-test-claimed",
  "frontendPaths": [
    "src/components/**",
    "src/pages/**",
    "*.tsx",
    "*.jsx"
  ],
  "skills": {
    "frontend": "review-frontend",
    "backend": "review-backend",
    "mixed": "review-mixed"
  }
}
```

### Step 2: Create Test Pull Request

In your test repository, create a PR with some code changes:

```bash
# Clone the test repository
git clone https://github.com/yourname/review-rock-test
cd review-rock-test

# Create a test branch
git checkout -b test/smoke-test-$(date +%s)

# Make some changes (example: add a simple file)
echo "export const hello = () => console.log('Hello');" > src/hello.ts
git add src/hello.ts
git commit -m "test: Add hello function for smoke test"

# Push and create PR
git push -u origin HEAD
gh pr create --title "Smoke Test PR" --body "Testing Review Rock workflow"

# Note the PR number from the output
export TEST_PR_NUMBER=<PR_NUMBER>
```

## Manual Test Execution

### Phase 1: Start Review Rock

```bash
# Run Review Rock with test config
review-rock yourname/review-rock-test --config review-rock.test.config.json
```

**Expected Output:**
```
[PollingService] Polling yourname/review-rock-test for unclaimed PRs (claim label: review-rock-test-claimed)
[PollingService] Found 1 unclaimed PRs out of 1 total
[PollingService] Processing PR #<PR_NUMBER>: Smoke Test PR
```

### Phase 2: Verify PR Claiming

While Review Rock is running, check the PR on GitHub:

```bash
# In a separate terminal, view the PR
gh pr view $TEST_PR_NUMBER --repo yourname/review-rock-test
```

**Expected:**
- ✅ PR should have the label `review-rock-test-claimed` added
- ✅ Label should appear within 1-2 minutes of starting Review Rock

### Phase 3: Verify Review Generation

Monitor the Review Rock console output:

**Expected Output:**
```
[ReviewService] Generating review for PR #<PR_NUMBER>
[ReviewService] Review generated successfully, length: XXX chars
```

### Phase 4: Verify Comment Posting

**NOTE:** Comment posting is currently stubbed in the workflow (see workflow.ts:94).
Once implemented, verify:

```bash
# View PR comments
gh pr view $TEST_PR_NUMBER --comments --repo yourname/review-rock-test
```

**Expected:**
- ✅ Review Rock should post a comment with the generated review
- ✅ Comment should contain code review feedback

### Phase 5: Verify Polling Continues

Leave Review Rock running for 2-3 polling cycles:

**Expected:**
- ✅ After processing the PR, polling should continue
- ✅ Claimed PRs should be skipped in subsequent polls
- ✅ No duplicate processing of the same PR

## Test Cleanup

### 1. Stop Review Rock
```bash
# Press Ctrl+C to stop the process
^C
```

### 2. Remove Claim Label
```bash
gh pr edit $TEST_PR_NUMBER --remove-label review-rock-test-claimed --repo yourname/review-rock-test
```

### 3. Close Test PR
```bash
gh pr close $TEST_PR_NUMBER --repo yourname/review-rock-test --delete-branch
```

### 4. Remove Test Config
```bash
rm review-rock.test.config.json
```

## Error Scenarios to Test

### Scenario 1: AWS Token Expiry
1. Let AWS credentials expire
2. Start Review Rock
3. **Expected:** Review Rock should detect token expiry and log appropriate error

### Scenario 2: GitHub Rate Limiting
1. Make multiple rapid API calls to trigger rate limiting
2. **Expected:** Review Rock should retry with exponential backoff

### Scenario 3: Concurrent Instances
1. Start two Review Rock instances pointing to the same repo
2. Create a PR
3. **Expected:** Only one instance should claim and process the PR

### Scenario 4: Network Interruption
1. Start Review Rock
2. Temporarily disable network (or use network simulator)
3. **Expected:** Review Rock should handle transient errors and retry

## Success Criteria

The smoke test passes if:

- ✅ Review Rock successfully lists open PRs
- ✅ PR is claimed with the configured label
- ✅ Review is generated without errors
- ✅ Comment is posted to PR (once implemented)
- ✅ Polling continues after processing
- ✅ No crashes or unhandled errors
- ✅ Claimed PRs are skipped in subsequent polls

## Troubleshooting

### Issue: "gh CLI not authenticated"
**Solution:** Run `gh auth login` and follow the prompts

### Issue: "AWS credentials not found"
**Solution:** Configure AWS credentials using `aws configure` or environment variables

### Issue: "Review generation timeout"
**Solution:**
- Check AWS Bedrock access
- Verify network connectivity
- Check Bedrock service quotas

### Issue: "Label claim failed"
**Solution:**
- Verify you have write access to the repository
- Check if another instance already claimed the PR
- Ensure the label doesn't already exist on the PR

### Issue: "Cannot find module '@aws-sdk/client-bedrock-runtime'"
**Solution:** Run `pnpm install` to install dependencies

## Notes

- This is a **manual** test plan requiring human observation
- Estimated time: 10-15 minutes
- Can be run repeatedly with different test scenarios
- Consider creating a dedicated test repository to avoid polluting production repos
- The test validates the **happy path** - see "Error Scenarios" for edge case testing

## Automation Considerations

For automated smoke testing, see `scripts/smoke-test.sh` which provides:
- Automatic test PR creation
- Review Rock execution with timeout
- Verification of claim label
- Automatic cleanup

**Note:** Full automation requires comment posting to be implemented in the workflow.
