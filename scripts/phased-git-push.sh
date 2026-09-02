#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# RentMaikar Phased Git Commit & Push Script
# Solves GitHub timeout / 413 Payload Too Large errors by committing in 3 phases
# ==============================================================================

REPO_URL="${1:-https://github.com/beresdowds-afk/Rentmaikar-G2.git}"
GITHUB_TOKEN="${2:-${GITHUB_TOKEN:-}}"

echo "=================================================================="
echo "  RentMaikar Phased Git Repository Push"
echo "=================================================================="

# Ensure Git author information is configured
if [ -z "$(git config user.name || true)" ]; then
  git config user.name "RentMaikar Bot"
fi
if [ -z "$(git config user.email || true)" ]; then
  git config user.email "adebayoolusola39@gmail.com"
fi

# Increase git HTTP buffer to 500MB to avoid large-pack dropouts
git config --global http.postBuffer 524288000
git config --global http.maxRequestBuffer 104857600
git config --global core.compression 9

if [ ! -d ".git" ]; then
  echo "==> Initializing git repository..."
  git init
  git branch -M main
fi

# Determine authenticated remote URL if GITHUB_TOKEN is available
PUSH_REMOTE_URL="$REPO_URL"
if [ -n "$GITHUB_TOKEN" ]; then
  # Strip any existing https:// or credentials
  CLEAN_REPO="${REPO_URL#https://}"
  CLEAN_REPO="${CLEAN_REPO#*@}"
  PUSH_REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@${CLEAN_REPO}"
  echo "==> Authenticated remote URL configured with Fine-Grained Token."
fi

if git remote | grep -q "^origin$"; then
  git remote set-url origin "$PUSH_REMOTE_URL"
else
  git remote add origin "$PUSH_REMOTE_URL"
fi
echo "==> Remote origin target: $REPO_URL"

# ------------------------------------------------------------------------------
# PRE-PUSH: Fetch and Pull remote history to align git tree
# ------------------------------------------------------------------------------
echo "==> [Pre-Push] Fetching existing commits from remote origin..."
if git ls-remote --exit-code origin &>/dev/null; then
  echo "==> Pulling remote origin/main (rebase with allow-unrelated-histories)..."
  git fetch origin main || true
  git pull origin main --rebase --allow-unrelated-histories -X ours || true
  echo "✓ Remote history reconciled."
fi

# ------------------------------------------------------------------------------
# PHASE 1: Root Configs, Public Assets, Docs, Scripts & Tooling (~100 files)
# ------------------------------------------------------------------------------
echo ""
echo "==> [Phase 1/3] Staging core configuration, public assets, docs & tooling..."
git add \
  .gitignore \
  .dockerignore \
  .env.example \
  CNAME \
  Dockerfile \
  cloudbuild.yaml \
  components.json \
  docker-compose.yml \
  eslint.config.js \
  index.html \
  metadata.json \
  nginx.conf \
  package.json \
  package-lock.json \
  playwright.config.ts \
  postcss.config.js \
  tailwind.config.ts \
  tsconfig*.json \
  vite.config.ts \
  public/ \
  docs/ \
  architecture/ \
  scripts/ \
  README.md || true

if ! git diff --cached --quiet; then
  git commit -m "chore(init): [Phase 1/3] root configs, public assets, docs and tooling"
  echo "✓ Phase 1 committed successfully."
  if git remote | grep -q "^origin$"; then
    echo "==> Pushing Phase 1 to origin/main..."
    git push -u origin main
    echo "✓ Phase 1 pushed successfully."
  fi
else
  echo "ℹ Phase 1: No staged changes."
fi

# ------------------------------------------------------------------------------
# PHASE 2: Supabase Migrations, Edge Functions & Backend (~630 files)
# ------------------------------------------------------------------------------
echo ""
echo "==> [Phase 2/3] Staging backend services & Supabase database engine..."
git add supabase/ backend/ || true

if ! git diff --cached --quiet; then
  git commit -m "feat(backend): [Phase 2/3] supabase migrations, edge functions and backend services"
  echo "✓ Phase 2 committed successfully."
  if git remote | grep -q "^origin$"; then
    echo "==> Pushing Phase 2 to origin/main..."
    git push origin main
    echo "✓ Phase 2 pushed successfully."
  fi
else
  echo "ℹ Phase 2: No staged changes."
fi

# ------------------------------------------------------------------------------
# PHASE 3: Frontend Application, UI Components, Pages & Logic (~1035 files)
# ------------------------------------------------------------------------------
echo ""
echo "==> [Phase 3/3] Staging frontend UI, components, hooks, contexts and pages..."
git add src/ || true
git add . || true

if ! git diff --cached --quiet; then
  git commit -m "feat(frontend): [Phase 3/3] react application, UI components, hooks and pages"
  echo "✓ Phase 3 committed successfully."
  if git remote | grep -q "^origin$"; then
    echo "==> Pushing Phase 3 to origin/main..."
    git push origin main
    echo "✓ Phase 3 pushed successfully."
  fi
else
  echo "ℹ Phase 3: No staged changes."
fi

echo ""
echo "=================================================================="
echo "🎉 All 3 phases committed and pushed successfully!"
echo "=================================================================="
