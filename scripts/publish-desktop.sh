#!/usr/bin/env bash
set -euo pipefail

# Configuration
PUBLIC_REPO_URL="git@github-iamdokoye:yarda-studio/desktop.git"
TEMP_DIR="/tmp/yarda-desktop-export"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Preparing public desktop export from $PROJECT_ROOT..."
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# 1. Clone the public repo into a temp directory (or init if fresh)
if git ls-remote "$PUBLIC_REPO_URL" &>/dev/null; then
  echo "==> Cloning existing public desktop repo..."
  git clone --depth 1 "$PUBLIC_REPO_URL" "$TEMP_DIR"
else
  echo "==> Initializing fresh git repo in export directory..."
  git init "$TEMP_DIR"
  (cd "$TEMP_DIR" && git remote add origin "$PUBLIC_REPO_URL" && git checkout -b main)
fi

# 2. Sync client code, strictly excluding proprietary backend & secrets
echo "==> Copying open-source client files..."
rsync -av --delete \
  --exclude '.git' \
  --exclude '.github' \
  --exclude 'supabase' \
  --exclude 'services' \
  --exclude 'website' \
  --exclude 'docs/PRO_TEAMS_IMPLEMENTATION_PROMPT.md' \
  --exclude 'docs/hosted-outputs-design.md' \
  --exclude 'docs/lovable-ui-*' \
  --exclude '.env*' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'src-tauri/target' \
  --exclude '.taste-skill' \
  --exclude '.claude' \
  --exclude '.agents' \
  --exclude '.DS_Store' \
  --exclude '* 2.*' \
  "$PROJECT_ROOT/" "$TEMP_DIR/"

# 3. Commit and push to the public repo
cd "$TEMP_DIR"
git add -A

if git diff --staged --quiet; then
  echo "==> No changes detected. Public repo is already up to date."
else
  COMMIT_MSG="release: sync open-source desktop client ($(date +'%Y-%m-%d %H:%M'))"
  git commit -m "$COMMIT_MSG"
  echo "==> Pushing to public repo ($PUBLIC_REPO_URL)..."
  git push -u origin main
  echo "==> Successfully published to yarda-studio/desktop!"
fi

# Cleanup
rm -rf "$TEMP_DIR"
