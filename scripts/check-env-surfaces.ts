/**
 * Guardrail: keeps admin/backend secrets out of the public frontend surface.
 * Run: tsx scripts/check-env-surfaces.ts (npm run check:env-surfaces)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_PORTAL_VARS = [
  "PORTAL_SECRET_KEY",
  "PORTAL_ADMIN_EMAIL",
  "PORTAL_ADMIN_PASSWORD",
  "PORTAL_MASTER_KEY",
];

const SENSITIVE_NAME =
  /\b(?:PORTAL_[A-Z0-9_]+|[A-Z0-9_]*SERVICE_ROLE[A-Z0-9_]*|[A-Z0-9_]*SECRET[A-Z0-9_]*|[A-Z0-9_]*PRIVATE[A-Z0-9_]*)\b/g;
const SENSITIVE_VITE =
  /\bVITE_[A-Z0-9_]*(?:PORTAL|SERVICE_ROLE|SECRET|PRIVATE)[A-Z0-9_]*\b/g;
const PORTAL_NAME = /\bPORTAL_[A-Z0-9_]+\b/g;

export function findSensitiveNames(content: string): string[] {
  return [...new Set(content.match(SENSITIVE_NAME) ?? [])];
}

export function findSensitiveViteNames(content: string): string[] {
  return [...new Set(content.match(SENSITIVE_VITE) ?? [])];
}

export function findPortalNames(content: string): string[] {
  return [...new Set(content.match(PORTAL_NAME) ?? [])];
}

export function findMissingPortalVars(adminTemplate: string): string[] {
  return REQUIRED_PORTAL_VARS.filter(
    (name) => !new RegExp(`^\\s*${name}=`, "m").test(adminTemplate),
  );
}

const PUBLIC_FILES = [
  "Dockerfile",
  "frontend/Dockerfile",
  "nginx.conf.template",
  "nginx.conf",
  "handoff/env/public-frontend.env.template",
];
const ADMIN_TEMPLATE = "handoff/env/admin-backend.env.template";
const PUBLIC_TEMPLATE = "handoff/env/public-frontend.env.template";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!/\.test\./.test(entry) && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) out.push(full);
  }
  return out;
}

export function runChecks(root: string): string[] {
  const errors: string[] = [];
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  for (const file of PUBLIC_FILES) {
    if (!existsSync(join(root, file))) {
      if (file === PUBLIC_TEMPLATE) errors.push(`${file}: file is missing`);
      continue;
    }
    for (const name of findSensitiveNames(read(file))) {
      errors.push(`${file}: sensitive variable name "${name}" in public surface`);
    }
  }

  const viteTargets = ["vite.config.ts"];
  if (existsSync(join(root, "src"))) {
    viteTargets.push(...walk(join(root, "src")).map((f) => relative(root, f)));
  }
  for (const file of viteTargets) {
    if (!existsSync(join(root, file))) continue;
    for (const name of findSensitiveViteNames(read(file))) {
      errors.push(`${file}: sensitive variable exposed with VITE_ prefix "${name}"`);
    }
  }

  if (!existsSync(join(root, ADMIN_TEMPLATE))) {
    errors.push(`${ADMIN_TEMPLATE}: file is missing`);
  } else {
    for (const name of findMissingPortalVars(read(ADMIN_TEMPLATE))) {
      errors.push(`${ADMIN_TEMPLATE}: missing ${name}`);
    }
  }
  if (existsSync(join(root, PUBLIC_TEMPLATE))) {
    for (const name of findPortalNames(read(PUBLIC_TEMPLATE))) {
      errors.push(`${PUBLIC_TEMPLATE}: ${name} must not appear in the public template`);
    }
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd();
  const errors = runChecks(root);
  if (errors.length > 0) {
    console.error("Env surface check FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("Env surface check passed.");
}
