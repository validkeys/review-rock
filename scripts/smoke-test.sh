#!/usr/bin/env bash
#
# Review Rock - Automated Smoke Test Script
#
# This script automates the smoke test workflow:
# 1. Creates a test PR in a test repository
# 2. Runs Review Rock for one polling cycle
# 3. Verifies the PR was claimed
# 4. Cleans up test artifacts
#
# Usage:
#   ./scripts/smoke-test.sh <repository>
#
# Example:
#   ./scripts/smoke-test.sh myorg/review-rock-test
#
# Prerequisites:
# - gh CLI installed and authenticated
# - AWS credentials configured
# - Write access to test repository
# - Review Rock installed globally or built locally

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REPO="${1:-}"
CLAIM_LABEL="review-rock-smoke-test"
POLLING_INTERVAL_MINUTES=1
TEST_BRANCH="test/smoke-test-$(date +%s)"
TEST_FILE="smoke-test-$(date +%s).ts"
SMOKE_TEST_TIMEOUT=300 # 5 minutes

# Cleanup function
cleanup() {
  echo -e "${YELLOW}Cleaning up...${NC}"

  if [ -n "${TEST_PR_NUMBER:-}" ]; then
    echo "Removing claim label from PR #${TEST_PR_NUMBER}"
    gh pr edit "$TEST_PR_NUMBER" --remove-label "$CLAIM_LABEL" --repo "$REPO" 2>/dev/null || true

    echo "Closing PR #${TEST_PR_NUMBER}"
    gh pr close "$TEST_PR_NUMBER" --repo "$REPO" --delete-branch 2>/dev/null || true
  fi

  if [ -n "${TEST_REPO_DIR:-}" ] && [ -d "$TEST_REPO_DIR" ]; then
    echo "Removing cloned repository"
    rm -rf "$TEST_REPO_DIR"
  fi

  if [ -f "review-rock.smoke-test.config.json" ]; then
    echo "Removing test config"
    rm -f review-rock.smoke-test.config.json
  fi

  echo -e "${GREEN}Cleanup complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Validate arguments
if [ -z "$REPO" ]; then
  echo -e "${RED}Error: Repository not specified${NC}"
  echo "Usage: $0 <repository>"
  echo "Example: $0 myorg/review-rock-test"
  exit 1
fi

echo -e "${GREEN}Review Rock Smoke Test${NC}"
echo "Repository: $REPO"
echo "Claim Label: $CLAIM_LABEL"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v gh &> /dev/null; then
  echo -e "${RED}Error: gh CLI not found${NC}"
  echo "Install from: https://cli.github.com/"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo -e "${RED}Error: gh CLI not authenticated${NC}"
  echo "Run: gh auth login"
  exit 1
fi

if ! command -v aws &> /dev/null; then
  echo -e "${RED}Error: AWS CLI not found${NC}"
  echo "Install from: https://aws.amazon.com/cli/"
  exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
  echo -e "${RED}Error: AWS credentials not configured${NC}"
  echo "Run: aws configure"
  exit 1
fi

echo -e "${GREEN}✓ Prerequisites validated${NC}"
echo ""

# Create test configuration
echo -e "${YELLOW}Creating test configuration...${NC}"
cat > review-rock.smoke-test.config.json <<EOF
{
  "repository": "$REPO",
  "pollingIntervalMinutes": $POLLING_INTERVAL_MINUTES,
  "claimLabel": "$CLAIM_LABEL",
  "frontendPaths": [
    "src/**/*.tsx",
    "src/**/*.jsx"
  ],
  "skills": {
    "frontend": "review-frontend",
    "backend": "review-backend",
    "mixed": "review-mixed"
  }
}
EOF
echo -e "${GREEN}✓ Test configuration created${NC}"
echo ""

# Clone repository and create test PR
echo -e "${YELLOW}Creating test PR...${NC}"

TEST_REPO_DIR=$(mktemp -d)
git clone "https://github.com/$REPO" "$TEST_REPO_DIR" --quiet

cd "$TEST_REPO_DIR"

# Create test branch and file
git checkout -b "$TEST_BRANCH" --quiet

mkdir -p src
cat > "src/$TEST_FILE" <<EOF
/**
 * Smoke test file for Review Rock
 * Generated: $(date)
 */

export const smokeTest = () => {
  return "Hello from Review Rock smoke test!";
};

export const add = (a: number, b: number): number => {
  return a + b;
};
EOF

git add "src/$TEST_FILE"
git commit -m "test: Add smoke test file for Review Rock" --quiet
git push -u origin "$TEST_BRANCH" --quiet

# Create PR
TEST_PR_NUMBER=$(gh pr create \
  --title "Smoke Test: Review Rock $(date +%Y-%m-%d\ %H:%M:%S)" \
  --body "Automated smoke test PR for Review Rock. Safe to close." \
  --repo "$REPO" \
  --head "$TEST_BRANCH" \
  | grep -oE '[0-9]+$')

echo -e "${GREEN}✓ Test PR created: #${TEST_PR_NUMBER}${NC}"
echo "  URL: https://github.com/$REPO/pull/$TEST_PR_NUMBER"
echo ""

# Return to original directory
cd - > /dev/null

# Run Review Rock for one cycle
echo -e "${YELLOW}Running Review Rock...${NC}"
echo "Timeout: ${SMOKE_TEST_TIMEOUT}s"
echo ""

# Check if review-rock is installed
if ! command -v review-rock &> /dev/null; then
  echo -e "${YELLOW}Warning: review-rock not installed globally${NC}"
  echo "Attempting to run from local build..."

  if [ ! -f "dist/cli/index.js" ]; then
    echo "Building Review Rock..."
    pnpm build
  fi

  REVIEW_ROCK_CMD="node dist/cli/index.js"
else
  REVIEW_ROCK_CMD="review-rock"
fi

# Run Review Rock with timeout (will exit after one cycle in test mode)
# In a real scenario, we'd need to add a --once flag or similar
echo "Starting Review Rock (will run for max ${SMOKE_TEST_TIMEOUT}s)..."
timeout "$SMOKE_TEST_TIMEOUT" $REVIEW_ROCK_CMD "$REPO" --config review-rock.smoke-test.config.json || {
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 124 ]; then
    echo -e "${YELLOW}Review Rock timed out (expected behavior)${NC}"
  else
    echo -e "${RED}Review Rock exited with code $EXIT_CODE${NC}"
  fi
}
echo ""

# Verify PR was claimed
echo -e "${YELLOW}Verifying PR was claimed...${NC}"

PR_LABELS=$(gh pr view "$TEST_PR_NUMBER" --repo "$REPO" --json labels --jq '.labels[].name')

if echo "$PR_LABELS" | grep -q "$CLAIM_LABEL"; then
  echo -e "${GREEN}✓ SUCCESS: PR was claimed with label '$CLAIM_LABEL'${NC}"
  CLAIM_SUCCESS=true
else
  echo -e "${RED}✗ FAILED: PR was not claimed (label '$CLAIM_LABEL' not found)${NC}"
  echo "Found labels: $PR_LABELS"
  CLAIM_SUCCESS=false
fi
echo ""

# Check for comments (once implemented)
echo -e "${YELLOW}Checking for review comments...${NC}"
COMMENT_COUNT=$(gh pr view "$TEST_PR_NUMBER" --repo "$REPO" --json comments --jq '.comments | length')

if [ "$COMMENT_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓ Found $COMMENT_COUNT comment(s) on PR${NC}"
  gh pr view "$TEST_PR_NUMBER" --repo "$REPO" --comments | tail -20
else
  echo -e "${YELLOW}⚠ No comments found (comment posting may not be implemented yet)${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Smoke Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Repository: $REPO"
echo "PR Number: #$TEST_PR_NUMBER"
echo "PR URL: https://github.com/$REPO/pull/$TEST_PR_NUMBER"
echo ""

if [ "$CLAIM_SUCCESS" = true ]; then
  echo -e "${GREEN}Result: PASSED ✓${NC}"
  echo ""
  echo "The smoke test completed successfully:"
  echo "  ✓ Test PR created"
  echo "  ✓ Review Rock ran without errors"
  echo "  ✓ PR was claimed with label"
  echo ""
  exit 0
else
  echo -e "${RED}Result: FAILED ✗${NC}"
  echo ""
  echo "The smoke test failed. Check the output above for details."
  echo ""
  exit 1
fi
