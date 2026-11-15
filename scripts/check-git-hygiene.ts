import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(".");
const MAX_BLOB_BYTES = 25 * 1024 * 1024;

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-ssr",
  "coverage",
  ".cache",
  ".temp",
  ".aistudio",
  ".lovable",
  ".vite",
  "playwright-report",
  "test-results",
]);

const FORBIDDEN_UNIGNORED_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".zip", ".tgz", ".tar.gz"];
const FORBIDDEN_PATH_CHARS = /[`*?:|"<>]/;

const errors: string[] = [];

function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (rel === "backend/node_modules" || rel === "backend/dist") continue;
      walk(full);
      continue;
    }

    if (!entry.isFile()) continue;

    if (FORBIDDEN_PATH_CHARS.test(rel)) {
      errors.push(`Invalid cross-platform path characters: ${rel}`);
    }

    const size = statSync(full).size;
    if (size > MAX_BLOB_BYTES) {
      errors.push(`File exceeds 25 MiB GitHub push safety limit (${(size / 1048576).toFixed(2)} MiB): ${rel}`);
    }

    if (
      FORBIDDEN_UNIGNORED_EXTENSIONS.some((ext) => rel.toLowerCase().endsWith(ext)) &&
      !rel.startsWith("public/downloads/")
    ) {
      errors.push(`Unignored restricted key or archive file in workspace: ${rel}`);
    }
  }
}

walk(ROOT);

// 1. Validate .gitignore critical patterns
const gitignorePath = resolve(ROOT, ".gitignore");
if (!existsSync(gitignorePath)) {
  errors.push(".gitignore is missing");
} else {
  const gitignoreLines = new Set(
    readFileSync(gitignorePath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim()),
  );
  for (const required of [".env", ".env.*", "node_modules/", "dist/", "*.pem", "*.key", "*.zip"]) {
    if (!gitignoreLines.has(required)) {
      errors.push(`.gitignore missing required exclusion: ${required}`);
    }
  }
}

// 2. Validate phased-git-push.sh hygiene (never embed tokens in remote URL or run silent fetch || true)
const pushScriptPath = resolve(ROOT, "scripts", "phased-git-push.sh");
if (!existsSync(pushScriptPath)) {
  errors.push("scripts/phased-git-push.sh is missing");
} else {
  const pushScript = readFileSync(pushScriptPath, "utf8");
  if (/PUSH_REMOTE_URL=.*x-access-token/.test(pushScript)) {
    errors.push("scripts/phased-git-push.sh must not embed x-access-token into remote URL");
  }
  if (!pushScript.includes("GIT_ASKPASS")) {
    errors.push("scripts/phased-git-push.sh must use transient GIT_ASKPASS for token authentication");
  }
  if (!pushScript.includes("guard_staged_changes")) {
    errors.push("scripts/phased-git-push.sh must invoke guard_staged_changes before committing");
  }
}

if (errors.length > 0) {
  console.error("Git hygiene check failed:\n" + errors.map((e) => ` - ${e}`).join("\n"));
  process.exit(1);
}

console.log("Git hygiene check passed.");
