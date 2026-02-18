#!/usr/bin/env bash
# Usage: ./scripts/release.sh 0.2.0
#
# What it does:
#   1. Validates you're on main with a clean tree
#   2. Bumps version in package.json
#   3. Regenerates CHANGELOG.md with git-cliff
#   4. Commits changelog + package.json
#   5. Tags the commit vX.Y.Z
#   6. Pushes branch + tag → triggers GitHub Actions release workflow

set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  (e.g. 0.2.0)"
  exit 1
fi

TAG="v${VERSION}"

# ── Guards ─────────────────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "❌  Must be on main branch (currently on '$BRANCH')"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌  Working tree is dirty. Commit or stash changes first."
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌  Tag $TAG already exists."
  exit 1
fi

echo "▶  Releasing $TAG ..."

# ── Bump version in package.json ───────────────────────────────────────────
npm version "$VERSION" --no-git-tag-version
echo "✓  package.json → $VERSION"

# ── Regenerate CHANGELOG ───────────────────────────────────────────────────
# First, stage package.json bump so git-cliff picks up a clean state.
# We temporarily tag to generate the changelog, then reset the tag.
git add package.json
git commit -m "chore(release): bump version to $VERSION"

git tag "$TAG"
git-cliff -o CHANGELOG.md
git tag -d "$TAG"

git add CHANGELOG.md
git commit -m "chore(changelog): update for $TAG"
echo "✓  CHANGELOG.md updated"

# ── Tag ────────────────────────────────────────────────────────────────────
git tag "$TAG"
echo "✓  Tagged $TAG"

# ── Push ───────────────────────────────────────────────────────────────────
echo "▶  Pushing main + $TAG ..."
git push origin main
git push origin "$TAG"

echo ""
echo "✅  Released $TAG"
echo "   GitHub Actions will create the release and deploy the docs."
echo "   Watch: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/\.git$//')/actions"
