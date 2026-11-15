/**
 * Guardrail: enforces Rentmaikar Enterprise Email Policy across code, configs,
 * Edge Functions, and CI/CD workflows.
 *
 * Run: tsx scripts/check-email-policy.ts (npm run check:email-policy)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".yml", ".yaml", ".env", ".template", ".toml"]);
const IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".vite", "coverage", "android", "ios"]);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else {
      const hasKnownExt = Array.from(CODE_EXTENSIONS).some((ext) => entry.endsWith(ext));
      if (hasKnownExt || entry === ".env.example") {
        out.push(full);
      }
    }
  }
  return out;
}

function isTestFile(relPath: string): boolean {
  return (
    /(?:^|\/)(?:__tests__|test|tests)\//.test(relPath) ||
    /\.(?:test|spec)\.[tj]sx?$/.test(relPath) ||
    /_test\.[tj]sx?$/.test(relPath)
  );
}

const AUTHORIZED_RAW_RESEND_URL_FILES = new Set([
  "backend/src/services/emailService.ts",
  "backend/src/services/resendReceivingService.ts",
  "backend/src/services/emailLifecycleTest.ts",
  "backend/src/marketing/resendAdapter.ts",
  "src/server/emailService.ts",
  "src/server/emailLifecycleTest.ts",
  "src/server/marketing/resendAdapter.ts",
  "supabase/functions/_shared/resend-gateway.ts",
]);

const NON_EMAIL_AI_FUNCTIONS = new Set([
  "supabase/functions/region-autobuild/index.ts",
  "supabase/functions/inbox-attachment-ocr/index.ts",
]);

export function runEmailPolicyChecks(root: string): string[] {
  const errors: string[] = [];

  const scanTargets = [
    ...walk(join(root, "src")),
    ...walk(join(root, "backend/src")),
    ...walk(join(root, "supabase/functions")),
    ...walk(join(root, ".github/workflows")),
    ...walk(join(root, "handoff/env")),
  ];

  for (const singleFile of ["server.ts", ".env.example", "cloudbuild.yaml", "cloudbuild-backend.yaml", "supabase/config.toml"]) {
    const abs = join(root, singleFile);
    if (existsSync(abs)) scanTargets.push(abs);
  }

  for (const absPath of scanTargets) {
    const rel = relative(root, absPath).replaceAll("\\", "/");
    const testFile = isTestFile(rel);
    const content = readFileSync(absPath, "utf8");

    // 1. No SENT.DM email fallback anywhere
    if (!testFile && /\bsendEmailViaSent\b/.test(content)) {
      errors.push(`${rel}: prohibited SENT.DM email fallback reference "sendEmailViaSent"`);
    }

    // 2. No SMTP fallback config or transport
    if (!testFile && /\bSMTP_(?:HOST|PORT)\b/.test(content)) {
      errors.push(`${rel}: prohibited SMTP fallback variable (SMTP_HOST / SMTP_PORT)`);
    }

    // 3. No Lovable email/webhook dependencies or nameservers
    if (/@lovable\.dev\/(?:email-js|webhooks-js)/.test(content)) {
      errors.push(`${rel}: prohibited @lovable.dev email/webhook dependency`);
    }
    if (/ns[34]\.lovable\.cloud|\.lovable\.app/.test(content)) {
      errors.push(`${rel}: prohibited Lovable domain or nameserver reference`);
    }
    if (!NON_EMAIL_AI_FUNCTIONS.has(rel) && /\bLOVABLE_API_KEY\b/.test(content)) {
      errors.push(`${rel}: prohibited LOVABLE_API_KEY in email/auth/application path`);
    }

    // 4. No native Supabase auth mailer fallbacks in runtime source
    if (!testFile && /\.(?:auth\.resetPasswordForEmail|auth\.resend)\s*\(/.test(content)) {
      errors.push(`${rel}: prohibited native Supabase Auth email fallback (resetPasswordForEmail / resend)`);
    }

    // 5. No VITE_RESEND_* secret leakage
    if (/\bVITE_RESEND_[A-Z0-9_]*\b/.test(content)) {
      errors.push(`${rel}: prohibited VITE_RESEND_* frontend variable`);
    }

    // 6. Edge Functions must NOT hold or require RESEND_API_KEY (delegate via rentmaikar-backend)
    if (!testFile && rel.startsWith("supabase/functions/") && /\bRESEND_API_KEY\b/.test(content)) {
      errors.push(`${rel}: Edge Function must not read or require RESEND_API_KEY directly; delegate to rentmaikar-backend`);
    }

    // 7. Raw api.resend.com references strictly restricted to authorized backend modules
    if (!testFile && /https:\/\/api\.resend\.com/.test(content) && !AUTHORIZED_RAW_RESEND_URL_FILES.has(rel)) {
      errors.push(`${rel}: unauthorized direct https://api.resend.com reference outside rentmaikar-backend email gateway`);
    }

    // 8. No deployment or routing references to idle Cloud Run service rentmaikar3
    if (!testFile && /\brentmaikar3\b/.test(content)) {
      errors.push(`${rel}: prohibited reference to excluded idle Cloud Run service "rentmaikar3"`);
    }
  }

  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd();
  const errors = runEmailPolicyChecks(root);
  if (errors.length > 0) {
    console.error("Email policy check FAILED:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log("Email policy check passed.");
}
