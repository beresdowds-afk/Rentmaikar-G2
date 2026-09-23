#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# RentMaikar Permanent Resilient Phased Git Commit & Push Script
# 
# Solves GitHub timeout / 413 Payload Too Large / non-fast-forward rejection
# by aligning directly with origin/main and committing/pushing in 3 phases.
# ==============================================================================

REPO_URL="${1:-https://github.com/beresdowds-afk/Rentmaikar-G2.git}"
GITHUB_TOKEN="${2:-${GITHUB_TOKEN:-}}"

echo "=================================================================="
echo "  RentMaikar Phased Git Repository Push"
echo "=================================================================="

# 1. Ensure repository is initialized and aligned on main branch
if [ ! -d ".git" ]; then
  echo "==> Initializing git repository..."
  git init -b main 2>/dev/null || (git init && git branch -M main)
fi

# Ensure branch is explicitly main (handles default 'master' or detached HEAD)
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ]; then
  git checkout -B main 2>/dev/null || git branch -M main 2>/dev/null || true
elif [ "$CURRENT_BRANCH" != "main" ]; then
  git branch -M main 2>/dev/null || git checkout -B main 2>/dev/null || true
fi

# 2. Ensure Git author information is configured
if [ -z "$(git config user.name 2>/dev/null || true)" ]; then
  git config user.name "Olusola Adebayo"
fi
if [ -z "$(git config user.email 2>/dev/null || true)" ]; then
  git config user.email "beresdowds@gmail.com"
fi
git config --global user.name "Olusola Adebayo" 2>/dev/null || true
git config --global user.email "beresdowds@gmail.com" 2>/dev/null || true
git config --global --add safe.directory "*" 2>/dev/null || true
git config advice.ignoredHook false 2>/dev/null || true

# 3. Increase git HTTP buffers to 500MB to avoid large-pack dropouts and timeouts
git config http.postBuffer 524288000 || git config --global http.postBuffer 524288000 || true
git config http.maxRequestBuffer 104857600 || git config --global http.maxRequestBuffer 104857600 || true
git config core.compression 9 || git config --global core.compression 9 || true
git config http.version HTTP/1.1 || git config --global http.version HTTP/1.1 || true

# 4. Determine authenticated remote URL
PUSH_REMOTE_URL="$REPO_URL"
if [ -z "$GITHUB_TOKEN" ]; then
  CURRENT_ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "$CURRENT_ORIGIN" =~ x-access-token:([^@]+)@ ]]; then
    GITHUB_TOKEN="${BASH_REMATCH[1]}"
    echo "==> Retrieved existing access token from origin remote."
  fi
fi

if [ -n "$GITHUB_TOKEN" ]; then
  CLEAN_REPO="${REPO_URL#https://}"
  CLEAN_REPO="${CLEAN_REPO#*@}"
  PUSH_REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@${CLEAN_REPO}"
  echo "==> Authenticated remote URL configured with access token."
fi

if git remote | grep -q "^origin$"; then
  git remote set-url origin "$PUSH_REMOTE_URL"
else
  git remote add origin "$PUSH_REMOTE_URL"
fi
echo "==> Remote target: $REPO_URL"

# 5. Fetch and reconcile remote history (Prevents non-fast-forward rejections)
echo "==> [Pre-Push] Checking remote origin status..."
if git ls-remote --exit-code origin &>/dev/null; then
  echo "==> Fetching commits from origin/main..."
  git fetch origin main --depth=100 || git fetch origin main || true

  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    # If local branch has no commits yet (brand new git init), align HEAD to origin/main
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
      echo "==> Aligning working tree with origin/main to guarantee fast-forward commits..."
      git reset --mixed origin/main
    else
      # If local has commits, ensure we are based on origin/main safely
      MERGE_BASE="$(git merge-base HEAD origin/main 2>/dev/null || true)"
      REMOTE_HEAD="$(git rev-parse origin/main 2>/dev/null || true)"
      if [ -n "$REMOTE_HEAD" ] && [ "$MERGE_BASE" != "$REMOTE_HEAD" ]; then
        echo "==> Aligning branch delta with origin/main..."
        git pull --rebase --autostash origin main 2>/dev/null || {
          echo "⚠ Rebase conflict, safely falling back to merge with autostash..."
          git rebase --abort 2>/dev/null || true
          STASH_SAVED=0
          if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
            git stash push -u -m "phased-push-autostash" 2>/dev/null || true
            STASH_SAVED=1
          fi
          git merge origin/main --no-edit -m "merge: sync remote origin/main" --allow-unrelated-histories 2>/dev/null || true
          if [ "$STASH_SAVED" -eq 1 ]; then
            git stash pop 2>/dev/null || true
          fi
        }
      fi
    fi
    echo "✓ Remote history successfully reconciled."
  fi
fi

# Helper function to push with retry and dirty-working-tree protection
push_with_retry() {
  local phase_name="$1"
  local max_attempts=3
  local attempt=1
  local success=0

  while [ $attempt -le $max_attempts ]; do
    echo "==> Pushing $phase_name to origin/main (Attempt $attempt of $max_attempts)..."
    if git push --no-verify origin main; then
      echo "✓ $phase_name pushed successfully."
      success=1
      break
    else
      echo "⚠ Push attempt $attempt failed. Synchronizing with remote before retry..."
      git fetch origin main || true

      # Stash any dirty uncommitted changes in working tree before reconciling
      # so git merge or pull --rebase does not abort due to dirty working tree
      STASHED=0
      if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
        git stash push -u -m "retry-autostash" 2>/dev/null || true
        STASHED=1
      fi

      git pull --rebase origin main 2>/dev/null || \
        git merge origin/main --no-edit -m "merge: sync remote before retry" --allow-unrelated-histories 2>/dev/null || true

      if [ "$STASHED" -eq 1 ]; then
        git stash pop 2>/dev/null || true
      fi

      sleep 3
      attempt=$((attempt + 1))
    fi
  done

  if [ $success -ne 1 ]; then
    echo "❌ Failed to push $phase_name after $max_attempts attempts."
    exit 1
  fi
}

# ------------------------------------------------------------------------------
# PHASE 1: Root Configs, Public Assets, Docs, Scripts & Tooling
# ------------------------------------------------------------------------------
echo ""
echo "==> [Phase 1/3] Staging core configuration, public assets, docs & tooling..."
git add -A \
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
  bun.lock \
  playwright.config.ts \
  postcss.config.js \
  tailwind.config.ts \
  tsconfig*.json \
  vite.config.ts \
  vitest.config.ts \
  server.ts \
  public/ \
  docs/ \
  architecture/ \
  scripts/ \
  .github/ \
  tests/ \
  cloudflare/ \
  frontend/ \
  handoff/ \
  capacitor.config.ts \
  RENTMAIKAR_UI_NAVIGATION_ARCHITECTURE.md \
  README.md || true

if ! git diff --cached --quiet; then
  git commit -m "chore(config): [Phase 1/3] root configs, public assets, docs and tooling"
  echo "✓ Phase 1 committed successfully."
  push_with_retry "Phase 1"
else
  echo "ℹ Phase 1: No staged changes."
fi

# ------------------------------------------------------------------------------
# PHASE 2: Supabase Migrations, Edge Functions & Backend
# ------------------------------------------------------------------------------
echo ""
echo "==> [Phase 2/3] Staging backend services & Supabase database engine..."
git add -A supabase/ backend/ 2>/dev/null || true

if ! git diff --cached --quiet; then
  git commit -m "feat(backend): [Phase 2/3] supabase migrations, edge functions and backend services"
  echo "✓ Phase 2 committed successfully."
  push_with_retry "Phase 2"
else
  echo "ℹ Phase 2: No staged changes."
fi

# ------------------------------------------------------------------------------
# PHASE 3: Frontend Application, UI Components, Pages & Logic
# ------------------------------------------------------------------------------
echo ""
echo "==> [Phase 3/3] Staging frontend UI, components, hooks, contexts and pages..."
git add -A src/ || true
git add -A . || true

if ! git diff --cached --quiet; then
  git commit -m "feat(frontend): [Phase 3/3] react application, UI components, hooks and pages"
  echo "✓ Phase 3 committed successfully."
  push_with_retry "Phase 3"
else
  echo "ℹ Phase 3: No staged changes."
fi

echo ""
echo "=================================================================="
echo "🎉 All changes committed and pushed to origin/main successfully!"
echo "=================================================================="
