# Release Checklist

This document outlines the step-by-step process for releasing new versions of Review Rock to npm.

## Table of Contents

- [Pre-Release](#pre-release)
- [Version Management](#version-management)
- [Publishing to npm](#publishing-to-npm)
- [Post-Release](#post-release)
- [Rollback](#rollback)
- [Troubleshooting](#troubleshooting)

---

## Pre-Release

Before publishing a new version, ensure all quality gates pass:

### 1. Code Quality

- [ ] All tests passing: `pnpm test:run`
- [ ] Coverage ≥80%: `pnpm test:coverage`
- [ ] No type errors: `pnpm run typecheck`
- [ ] No lint errors: `pnpm run lint`
- [ ] Build succeeds: `pnpm run build`

### 2. Manual Testing

- [ ] Manual smoke test completed (see [tests/e2e/smoke-test.md](./tests/e2e/smoke-test.md))
- [ ] Tested on target Node.js versions (18+)
- [ ] Verified CLI works globally: `pnpm install -g .` → `review-rock --help`

### 3. Documentation

- [ ] README.md is up-to-date with latest features
- [ ] CHANGELOG.md updated with new version and changes
- [ ] TROUBLESHOOTING.md includes any new issues discovered
- [ ] Configuration example (`review-rock.config.example.ts`) is current

### 4. Version Bump

- [ ] package.json version bumped according to [Semantic Versioning](https://semver.org/)
  - **Patch** (0.1.0 → 0.1.1): Bug fixes only
  - **Minor** (0.1.0 → 0.2.0): New features, backward compatible
  - **Major** (0.1.0 → 1.0.0): Breaking changes

---

## Version Management

### Semantic Versioning Guidelines

Review Rock follows [Semantic Versioning 2.0.0](https://semver.org/):

**Given a version number MAJOR.MINOR.PATCH, increment:**

1. **MAJOR** version when you make incompatible API changes
   - Examples: Removing configuration options, changing CLI commands, breaking existing workflows
2. **MINOR** version when you add functionality in a backward compatible manner
   - Examples: New features, new configuration options, new skills support
3. **PATCH** version when you make backward compatible bug fixes
   - Examples: Fixing errors, improving performance, documentation updates

### Updating the Version

**Option 1: Manual**

Edit `package.json`:
```json
{
  "version": "0.2.0"
}
```

**Option 2: npm version**

Use npm's built-in version bump:
```bash
# Patch: 0.1.0 → 0.1.1
npm version patch

# Minor: 0.1.0 → 0.2.0
npm version minor

# Major: 0.1.0 → 1.0.0
npm version major
```

This automatically:
- Updates package.json
- Creates a git commit
- Creates a git tag

### Update CHANGELOG.md

Add a new section for the version:

```markdown
## [0.2.0] - 2026-04-15

### Added
- Feature 1
- Feature 2

### Changed
- Improvement 1

### Fixed
- Bug fix 1

### Breaking Changes
- Breaking change 1
```

---

## Publishing to npm

### 1. Verify npm Login

Ensure you're logged in to npm:

```bash
npm whoami
```

If not logged in:
```bash
npm login
```

### 2. Dry Run

Verify package contents before publishing:

```bash
npm pack --dry-run
```

Review the output to ensure:
- All necessary files are included (`dist/`, documentation)
- No sensitive files are included (`.env`, credentials, etc.)
- Package size is reasonable

### 3. Build Package

Build the final distribution:

```bash
pnpm run build
```

### 4. Publish to npm

Publish the package:

```bash
pnpm publish --access public
```

**Note:** The `prepublishOnly` script will automatically run:
1. `pnpm run build` - Builds the package
2. `pnpm run test:run` - Runs all tests

If either step fails, the publish will be aborted.

### 5. Verify Publication

Check that the package is available on npm:

```bash
npm view review-rock
```

You should see your new version listed.

---

## Post-Release

### 1. Tag the Release in Git

If you didn't use `npm version`, create a git tag manually:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Or push all tags:
```bash
git push --tags
```

### 2. Create GitHub Release

Create a GitHub release with the changelog:

```bash
gh release create v0.1.0 \
  --title "Review Rock v0.1.0" \
  --notes-file RELEASE_NOTES.md
```

Or manually via GitHub UI:
1. Go to https://github.com/validkeys/review-rock/releases/new
2. Choose the tag (v0.1.0)
3. Set release title: "Review Rock v0.1.0"
4. Copy the relevant section from CHANGELOG.md to the description
5. Click "Publish release"

### 3. Test Global Installation

Verify the published package works:

```bash
# Install globally
pnpm install -g review-rock

# Test the CLI
review-rock --help

# Test with a repository (if you have one set up)
review-rock owner/repo
```

### 4. Update Documentation

If needed:
- Update links in README.md
- Update installation instructions
- Announce the release (Twitter, blog, etc.)

### 5. Monitor for Issues

After release:
- Watch GitHub issues for bug reports
- Monitor npm download stats
- Check for user feedback

---

## Rollback

If you need to rollback a release due to critical bugs:

### Option 1: Deprecate Version (Recommended)

Deprecate the problematic version and publish a fix:

```bash
# Deprecate the bad version
npm deprecate review-rock@0.1.0 "Critical bug. Please use version 0.1.1 instead."

# Publish a fixed version
npm version patch
pnpm publish --access public
```

### Option 2: Unpublish (Only within 72 hours)

You can only unpublish a version within 72 hours of publication:

```bash
npm unpublish review-rock@0.1.0
```

**⚠️ Warning:** Unpublishing is discouraged by npm and should only be used in extreme cases (security vulnerabilities, accidental publication, etc.).

### Best Practice

Instead of unpublishing:
1. Deprecate the bad version
2. Publish a patch version with the fix
3. Update CHANGELOG.md with the fix
4. Notify users via GitHub release notes

---

## Troubleshooting

### "You do not have permission to publish"

**Cause:** You're not logged in or don't have publish rights.

**Solution:**
```bash
npm login
npm whoami  # Verify login
```

### "Package name too similar to existing package"

**Cause:** npm prevents publishing packages with names too similar to existing ones.

**Solution:** Choose a different package name and update throughout the project.

### "Version already published"

**Cause:** You're trying to publish a version that already exists on npm.

**Solution:** Bump the version number:
```bash
npm version patch
pnpm publish --access public
```

### "prepublishOnly script failed"

**Cause:** Tests or build failed.

**Solution:**
1. Check the error output
2. Fix the failing tests or build errors
3. Run `pnpm test:run` and `pnpm run build` manually to debug
4. Try publishing again

### "Package size exceeds limit"

**Cause:** Package is too large (npm has size limits).

**Solution:**
1. Check what's being included: `npm pack --dry-run`
2. Update `.npmignore` or `files` in package.json to exclude unnecessary files
3. Ensure `node_modules` and `tests` are not included

---

## Release Schedule

### Versioning Strategy

- **Patch releases** (0.1.x): As needed for bug fixes
- **Minor releases** (0.x.0): Monthly or when significant features are ready
- **Major releases** (x.0.0): When breaking changes are necessary

### Pre-Release Versions

For testing before official release:

```bash
# Publish a beta version
npm version 0.2.0-beta.1
pnpm publish --tag beta --access public

# Users can install with:
pnpm install -g review-rock@beta
```

---

## Checklist Summary

Quick reference for releasing:

```bash
# 1. Pre-release checks
pnpm test:run
pnpm test:coverage
pnpm run typecheck
pnpm run lint
pnpm run build

# 2. Manual smoke test
# Follow tests/e2e/smoke-test.md

# 3. Update version and changelog
npm version minor  # or patch/major
# Edit CHANGELOG.md

# 4. Commit changes
git add .
git commit -m "chore: Prepare release v0.2.0"

# 5. Publish
pnpm publish --access public

# 6. Tag and push
git push origin main
git push --tags

# 7. Create GitHub release
gh release create v0.2.0 --title "Review Rock v0.2.0" --notes-file <(sed -n '/## \[0.2.0\]/,/## \[/p' CHANGELOG.md | head -n -1)

# 8. Test installation
pnpm install -g review-rock
review-rock --help
```

---

## Additional Resources

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [npm version command](https://docs.npmjs.com/cli/version)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

---

For questions or issues with the release process, open an issue on GitHub or contact the maintainers.
