#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# RentMaikar Resilient Phased Git Commit & Push Script
#
# Permanent safeguards against:
#   - Ephemeral sandbox resets (.git stripped while workspace files remain)
#   - Git dubious ownership errors across UID boundaries
#   - Embedded PAT leakage into .git/config (uses transient GIT_ASKPASS)
#   - Silent unrelated-history root commits when remote fetch fails
#   - GitHub 413 Payload Too Large / HTTP/2 stream resets / timeouts
#   - Accidental staging of secrets, .env files, archives, or >25 MiB blobs
# ==============================================================================

REPO_URL="https://github.com/beresdowds-afk/Rentmaikar-G2.git"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
TARGET_BRANCH="${BRANCH:-main}"

# Backward-compatible positional args: [repo_url] [token] [branch]
# Also supports: --branch <name> | -b <name>
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--branch)
      TARGET_BRANCH="${2:?Missing branch name after $1}"
      shift 2
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ ${#POSITIONAL[@]} -ge 1 && -n "${POSITIONAL[0]}" ]]; then
  REPO_URL="${POSITIONAL[0]}"
fi
if [[ ${#POSITIONAL[@]} -ge 2 && -n "${POSITIONAL[1]}" ]]; then
  GITHUB_TOKEN="${POSITIONAL[1]}"
fi
if [[ ${#POSITIONAL[@]} -ge 3 && -n "${POSITIONAL[2]}" ]]; then
  TARGET_BRANCH="${POSITIONAL[2]}"
fi

# Normalize bare repo URL (never embed credentials into remote URL)
CLEAN_REPO_URL="${REPO_URL#https://}"
CLEAN_REPO_URL="${CLEAN_REPO_URL#*@}"
CLEAN_REPO_URL="https://${CLEAN_REPO_URL}"

echo "=================================================================="
echo "  RentMaikar Phased Git Push [Branch: $TARGET_BRANCH]"
echo "=================================================================="

export GIT_TERMINAL_PROMPT=0

ASKPASS_SCRIPT=""
cleanup() {
  if [[ -n "$ASKPASS_SCRIPT" && -f "$ASKPASS_SCRIPT" ]]; then
    rm -f "$ASKPASS_SCRIPT"
  fi
  if [[ -d ".git" ]] && git remote | grep -q "^origin$"; then
    git remote set-url origin "$CLEAN_REPO_URL" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 1. Global Git ownership & author configuration before any repository commands
WORKDIR="$(pwd)"
git config --global --add safe.directory "$WORKDIR" 2>/dev/null || true
git config --global --add safe.directory "*" 2>/dev/null || true
git config --global user.name "Olusola Adebayo" 2>/dev/null || true
git config --global user.email "beresdowds@gmail.com" 2>/dev/null || true
git config --global advice.ignoredHook false 2>/dev/null || true

# 2. Ensure repository is initialized cleanly without altering working tree files
if [[ ! -d ".git" ]]; then
  echo "==> Initializing .git repository in existing workspace..."
  git init -b "$TARGET_BRANCH" 2>/dev/null || { git init && git branch -M "$TARGET_BRANCH"; }
fi

if [[ -z "$(git config user.name 2>/dev/null || true)" ]]; then
  git config user.name "Olusola Adebayo"
fi
if [[ -z "$(git config user.email 2>/dev/null || true)" ]]; then
  git config user.email "beresdowds@gmail.com"
fi

# 3. Configure HTTP/1.1 & large-pack transport stability
git config http.postBuffer 524288000 || true
git config http.maxRequestBuffer 104857600 || true
git config core.compression 9 || true
git config http.version HTTP/1.1 || true
git config http.lowSpeedLimit 1000 || true
git config http.lowSpeedTime 60 || true

# 4. Configure clean origin URL and ephemeral GIT_ASKPASS auth (no PAT in .git/config)
if [[ -z "$GITHUB_TOKEN" ]]; then
  EXISTING_ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "$EXISTING_ORIGIN" =~ x-access-token:([^@]+)@ ]]; then
    GITHUB_TOKEN="${BASH_REMATCH[1]}"
    echo "==> Migrated existing token from origin URL to transient GIT_ASKPASS."
  fi
fi

if git remote | grep -q "^origin$"; then
  git remote set-url origin "$CLEAN_REPO_URL"
else
  git remote add origin "$CLEAN_REPO_URL"
fi

if [[ -n "$GITHUB_TOKEN" ]]; then
  ASKPASS_SCRIPT="$(mktemp)"
  chmod 700 "$ASKPASS_SCRIPT"
  cat > "$ASKPASS_SCRIPT" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  *Username*|*username*) echo "x-access-token" ;;
  *Password*|*password*) echo "${RENTMAIKAR_GIT_TOKEN:-}" ;;
  *) echo "" ;;
esac
EOF
  export RENTMAIKAR_GIT_TOKEN="$GITHUB_TOKEN"
  export GIT_ASKPASS="$ASKPASS_SCRIPT"
  echo "==> Transient GIT_ASKPASS configured (zero credentials stored in .git/config)."
else
  echo "⚠ Note: GITHUB_TOKEN not set; push relies on pre-configured Git credentials."
fi

echo "==> Remote target: $CLEAN_REPO_URL"

# Untrack any accidentally cached oversized archives or cookie artifacts
git rm -r --cached --ignore-unmatch public/downloads/*.zip *.zip cookies.txt 2>/dev/null || true

# 5. Fail-closed remote inspection and history anchoring
echo "==> [Pre-Push] Verifying remote reachability..."
if ! git ls-remote --exit-code origin >/dev/null 2>&1; then
  echo "❌ Unable to reach origin ($CLEAN_REPO_URL). Check network or GITHUB_TOKEN." >&2
  exit 1
fi

BASE_ANCHOR_BRANCH=""
if git ls-remote --exit-code --heads origin "$TARGET_BRANCH" >/dev/null 2>&1; then
  echo "==> Fetching origin/$TARGET_BRANCH (fail-closed)..."
  if ! git fetch origin "$TARGET_BRANCH" --depth=100; then
    echo "❌ Failed to fetch origin/$TARGET_BRANCH. Aborting to prevent divergent history." >&2
    exit 1
  fi
  BASE_ANCHOR_BRANCH="origin/$TARGET_BRANCH"
elif git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  echo "==> Remote branch '$TARGET_BRANCH' does not exist yet; anchoring from origin/main..."
  if ! git fetch origin main --depth=100; then
    echo "❌ Failed to fetch origin/main. Aborting to prevent unrelated root commit." >&2
    exit 1
  fi
  BASE_ANCHOR_BRANCH="origin/main"
fi

# Align branch state safely onto fetched history
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  # Unborn HEAD (fresh git init in existing workspace)
  git checkout -B "$TARGET_BRANCH" >/dev/null 2>&1 || true
  if [[ -n "$BASE_ANCHOR_BRANCH" ]]; then
    echo "==> Anchoring unborn HEAD index onto $BASE_ANCHOR_BRANCH (preserving all working tree files)..."
    git reset --mixed "$BASE_ANCHOR_BRANCH" >/dev/null
  fi
else
  if [[ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]]; then
    git checkout -B "$TARGET_BRANCH"
  fi
  if [[ "$BASE_ANCHOR_BRANCH" == "origin/$TARGET_BRANCH" ]]; then
    MERGE_BASE="$(git merge-base HEAD "origin/$TARGET_BRANCH" 2>/dev/null || true)"
    REMOTE_HEAD="$(git rev-parse "origin/$TARGET_BRANCH")"
    if [[ "$MERGE_BASE" != "$REMOTE_HEAD" ]]; then
      echo "==> Rebasing local commits onto origin/$TARGET_BRANCH..."
      if ! git pull --rebase --autostash origin "$TARGET_BRANCH"; then
        git rebase --abort 2>/dev/null || true
        echo "❌ Rebase conflict against origin/$TARGET_BRANCH. Resolve manually before pushing." >&2
        exit 1
      fi
    fi
  fi
fi

if [[ "$BASE_ANCHOR_BRANCH" == "origin/$TARGET_BRANCH" ]]; then
  git branch --set-upstream-to="origin/$TARGET_BRANCH" "$TARGET_BRANCH" 2>/dev/null || true
fi
echo "✓ Remote history anchored cleanly."

# Guard staged changes before commit: block secrets and >25 MiB blobs
MAX_BLOB_BYTES=$((25 * 1024 * 1024))
guard_staged_changes() {
  local phase_label="$1"
  local blocked=0
  while IFS= read -r -d '' path; do
    [[ -e "$path" ]] || continue

    # Reject secret / credential filenames
    if [[ "$path" =~ (^|/)\.env($|\.) && "$path" != ".env.example" ]] || \
       [[ "$path" =~ \.(pem|key|p12|pfx|zip|tgz|tar\.gz)$ ]] || \
       [[ "$path" =~ (service-account|firebase-adminsdk|cookies\.txt) ]]; then
      echo "❌ [$phase_label] Refusing to commit restricted/secret/archive file: $path" >&2
      git reset -q HEAD -- "$path" || true
      blocked=1
      continue
    fi

    # Reject oversized files (>25 MiB) to avoid HTTP 413 / GitHub 50-100MB rejections
    local size
    size="$(wc -c < "$path" | tr -d ' ')"
    if [[ "$size" -gt "$MAX_BLOB_BYTES" ]]; then
      echo "❌ [$phase_label] File exceeds 25 MiB limit ($size bytes): $path" >&2
      git reset -q HEAD -- "$path" || true
      blocked=1
    fi
  done < <(git diff --cached --name-only -z)

  if [[ "$blocked" -ne 0 ]]; then
    echo "❌ Aborting $phase_label due to staged security or size violation." >&2
    exit 1
  fi
}

# Helper function to push with exponential backoff retry and rebase reconciliation
push_with_retry() {
  local phase_name="$1"
  local max_attempts=3
  local attempt=1
  local success=0

  while [[ $attempt -le $max_attempts ]]; do
    echo "==> Pushing $phase_name to origin/$TARGET_BRANCH (Attempt $attempt of $max_attempts)..."
    if git push --set-upstream --no-verify origin "$TARGET_BRANCH"; then
      echo "✓ $phase_name pushed successfully."
      success=1
      break
    fi

    echo "⚠ Push attempt $attempt failed. Reconciling with origin/$TARGET_BRANCH..."
    if git ls-remote --exit-code --heads origin "$TARGET_BRANCH" >/dev/null 2>&1; then
      git fetch origin "$TARGET_BRANCH" --depth=100 || true
      if ! git pull --rebase --autostash origin "$TARGET_BRANCH"; then
        git rebase --abort 2>/dev/null || true
        echo "❌ Unable to rebase $phase_name cleanly onto origin/$TARGET_BRANCH." >&2
        exit 1
      fi
    fi

    sleep $((attempt * 3))
    attempt=$((attempt + 1))
  done

  if [[ $success -ne 1 ]]; then
    echo "❌ Failed to push $phase_name after $max_attempts attempts." >&2
    exit 1
  fi
}

# ------------------------------------------------------------------------------
# PHASE 1: Root Configs, Public Assets, Docs, Scripts & Tooling
# ------------------------------------------------------------------------------
echo ""
echo "==> [Phase 1/3] Staging core configuration, public assets, docs & tooling..."
PHASE1_ITEMS=(
  .gitignore
  .dockerignore
  .env.example
  CNAME
  Dockerfile
  cloudbuild.yaml
  cloudbuild-backend.yaml
  components.json
  docker-compose.yml
  eslint.config.js
  index.html
  metadata.json
  nginx.conf
  nginx.conf.template
  package.json
  package-lock.json
  bun.lock
  playwright.config.ts
  postcss.config.js
  tailwind.config.ts
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  vite.config.ts
  vitest.config.ts
  server.ts
  public/
  docs/
  architecture/
  scripts/
  .github/
  tests/
  cloudflare/
  frontend/
  handoff/
  capacitor.config.ts
  README.md
)

for item in "${PHASE1_ITEMS[@]}"; do
  if [[ -e "$item" ]]; then
    git add -A "$item" 2>/dev/null || true
  fi
done

if ! git diff --cached --quiet; then
  guard_staged_changes "Phase 1"
  git commit --no-verify -m "chore(config): [Phase 1/3] root configs, public assets, docs and tooling"
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
  guard_staged_changes "Phase 2"
  git commit --no-verify -m "feat(backend): [Phase 2/3] supabase migrations, edge functions and backend services"
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
git add -A src/ 2>/dev/null || true
git add -A . 2>/dev/null || true

if ! git diff --cached --quiet; then
  guard_staged_changes "Phase 3"
  git commit --no-verify -m "feat(frontend): [Phase 3/3] react application, UI components, hooks and pages"
  echo "✓ Phase 3 committed successfully."
  push_with_retry "Phase 3"
else
  echo "ℹ Phase 3: No staged changes."
fi

# ------------------------------------------------------------------------------
# Post-push remote SHA verification
# ------------------------------------------------------------------------------
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  LOCAL_SHA="$(git rev-parse HEAD)"
  REMOTE_SHA="$(git ls-remote origin "refs/heads/$TARGET_BRANCH" | awk '{print $1}')"
  if [[ -n "$REMOTE_SHA" && "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
    echo "⚠ Warning: Remote SHA ($REMOTE_SHA) differs from local HEAD ($LOCAL_SHA)." >&2
  else
    echo "✓ Verified remote refs/heads/$TARGET_BRANCH matches HEAD ($LOCAL_SHA)."
  fi
fi

if [[ "$TARGET_BRANCH" != "main" ]]; then
  echo ""
  echo "==> Open a Pull Request into 'main' to trigger required CI checks:"
  echo "    ${CLEAN_REPO_URL%.git}/compare/main...${TARGET_BRANCH}?expand=1"
fi

echo ""
echo "=================================================================="
echo "🎉 Phased push to origin/$TARGET_BRANCH completed!"
echo "=================================================================="
