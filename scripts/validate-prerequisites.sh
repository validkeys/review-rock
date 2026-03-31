#!/usr/bin/env bash

set -e

# Colors and symbols
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CHECK_MARK="${GREEN}✓${NC}"
CROSS_MARK="${RED}✗${NC}"
WARNING_MARK="${YELLOW}⚠${NC}"

# Track overall status
CRITICAL_FAILURE=0

echo "Review Rock - Prerequisite Validation"
echo "======================================"
echo ""

# Check Node.js version
echo -n "Checking Node.js version (>= 18.0.0)... "
if ! command -v node &> /dev/null; then
    echo -e "${CROSS_MARK} Node.js not found"
    echo "  Install Node.js from: https://nodejs.org/"
    CRITICAL_FAILURE=1
else
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "${CHECK_MARK} v${NODE_VERSION}"
    else
        echo -e "${CROSS_MARK} v${NODE_VERSION} (requires >= 18.0.0)"
        echo "  Install Node.js 18+ from: https://nodejs.org/"
        CRITICAL_FAILURE=1
    fi
fi

# Check pnpm version
echo -n "Checking pnpm version (>= 8.0.0)... "
if ! command -v pnpm &> /dev/null; then
    echo -e "${CROSS_MARK} pnpm not found"
    echo "  Install pnpm: npm install -g pnpm"
    CRITICAL_FAILURE=1
else
    PNPM_VERSION=$(pnpm --version)
    PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
    if [ "$PNPM_MAJOR" -ge 8 ]; then
        echo -e "${CHECK_MARK} v${PNPM_VERSION}"
    else
        echo -e "${CROSS_MARK} v${PNPM_VERSION} (requires >= 8.0.0)"
        echo "  Upgrade pnpm: npm install -g pnpm@latest"
        CRITICAL_FAILURE=1
    fi
fi

# Check GitHub CLI
echo -n "Checking GitHub CLI (gh)... "
if ! command -v gh &> /dev/null; then
    echo -e "${CROSS_MARK} gh CLI not found"
    echo "  Install from: https://cli.github.com/"
    CRITICAL_FAILURE=1
else
    GH_VERSION=$(gh --version | head -n1 | awk '{print $3}')
    echo -e "${CHECK_MARK} v${GH_VERSION}"

    # Check gh authentication
    echo -n "Checking GitHub CLI authentication... "
    if gh auth status &> /dev/null; then
        echo -e "${CHECK_MARK} authenticated"
    else
        echo -e "${CROSS_MARK} not authenticated"
        echo "  Run: gh auth login"
        CRITICAL_FAILURE=1
    fi
fi

# Check Claude CLI
echo -n "Checking Claude CLI (claude)... "
if ! command -v claude &> /dev/null; then
    echo -e "${CROSS_MARK} claude CLI not found"
    echo "  Install claude from: https://github.com/anthropics/claude-code"
    CRITICAL_FAILURE=1
else
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
    echo -e "${CHECK_MARK} found (${CLAUDE_VERSION})"
fi

# Check AWS credentials (optional)
echo -n "Checking AWS credentials (optional)... "
if ! command -v aws &> /dev/null; then
    echo -e "${WARNING_MARK} AWS CLI not found"
    echo "  Note: AWS credentials may be required for Claude CLI authentication"
    echo "  Install from: https://aws.amazon.com/cli/"
else
    if aws sts get-caller-identity &> /dev/null; then
        CALLER_IDENTITY=$(aws sts get-caller-identity --query 'UserId' --output text)
        echo -e "${CHECK_MARK} configured (${CALLER_IDENTITY})"
    else
        echo -e "${WARNING_MARK} not configured or expired"
        echo "  Note: Run 'aws sso login' if using AWS SSO"
        echo "  Note: This may be required for Claude CLI authentication"
    fi
fi

# Check style anchor repositories
echo ""
echo "Style Anchor Repositories:"
echo -n "  ~/Sites/ai-use-repos/effect... "
EFFECT_PATH="$HOME/Sites/ai-use-repos/effect"
if [ -d "$EFFECT_PATH" ]; then
    echo -e "${CHECK_MARK} found"
else
    echo -e "${WARNING_MARK} not found"
    echo "    Clone with: git clone https://github.com/Effect-TS/effect.git $EFFECT_PATH"
fi

echo -n "  ~/Sites/ai-use-repos/EffectPatterns... "
PATTERNS_PATH="$HOME/Sites/ai-use-repos/EffectPatterns"
if [ -d "$PATTERNS_PATH" ]; then
    echo -e "${CHECK_MARK} found"
else
    echo -e "${WARNING_MARK} not found"
    echo "    Note: Clone Effect patterns repository to $PATTERNS_PATH for style reference"
    echo "    Alternatively, use Effect-TS documentation: https://effect.website/"
fi

echo ""
echo "======================================"

if [ $CRITICAL_FAILURE -eq 1 ]; then
    echo -e "${CROSS_MARK} Critical prerequisites missing. Please install missing dependencies."
    exit 1
else
    echo -e "${CHECK_MARK} All critical prerequisites met!"
    exit 0
fi
