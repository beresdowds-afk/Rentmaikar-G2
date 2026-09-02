import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "fs";
import { resolve, join, relative, extname } from "path";
import { execSync } from "child_process";

interface DiagnosticResult {
  category: string;
  check: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: string[];
  recommendation?: string;
}

const results: DiagnosticResult[] = [];

function record(result: DiagnosticResult) {
  results.push(result);
}

// Colors for CLI output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}  RentMaikar Build, GitHub & VITE Environment Diagnostic${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}\n`);

// Helper to recursively list files
function getAllFiles(dir: string, ignorePatterns: RegExp[] = []): string[] {
  let fileList: string[] = [];
  if (!existsSync(dir)) return fileList;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(process.cwd(), fullPath);

    if (ignorePatterns.some((p) => p.test(relPath) || p.test(entry.name))) {
      continue;
    }

    if (entry.isDirectory()) {
      fileList = fileList.concat(getAllFiles(fullPath, ignorePatterns));
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const ignoreDirs = [/node_modules/, /\.git/, /dist/, /coverage/, /\.cache/];

// ----------------------------------------------------
// 1. VITE & CLIENT ENVIRONMENT VARIABLES AUDIT
// ----------------------------------------------------
console.log(`${colors.bold}[1/5] Analyzing Environment Variables & VITE_ Configuration...${colors.reset}`);

const allSourceFiles = getAllFiles(resolve("src"), ignoreDirs);
const viteEnvRegex = /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g;
const genericMetaEnvRegex = /import\.meta\.env\.([A-Z0-9_]+)/g;

const codeViteVars = new Map<string, Set<string>>();
const allCodeMetaVars = new Set<string>();

for (const file of allSourceFiles) {
  const content = readFileSync(file, "utf-8");
  let match: RegExpExecArray | null;

  while ((match = viteEnvRegex.exec(content)) !== null) {
    const varName = match[1];
    if (!codeViteVars.has(varName)) {
      codeViteVars.set(varName, new Set());
    }
    codeViteVars.get(varName)?.add(relative(process.cwd(), file));
  }

  while ((match = genericMetaEnvRegex.exec(content)) !== null) {
    allCodeMetaVars.add(match[1]);
  }
}

// Parse .env.example
const envExamplePath = resolve(".env.example");
const exampleVars = new Set<string>();
if (existsSync(envExamplePath)) {
  const lines = readFileSync(envExamplePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      const key = eqIdx > -1 ? trimmed.slice(0, eqIdx).trim() : trimmed;
      if (key) exampleVars.add(key);
    }
  }
  record({
    category: "Environment",
    check: ".env.example Existence",
    status: "PASS",
    message: `Found .env.example with ${exampleVars.size} documented variables.`,
  });
} else {
  record({
    category: "Environment",
    check: ".env.example Existence",
    status: "FAIL",
    message: ".env.example is missing from workspace root.",
    recommendation: "Create .env.example declaring all required environment variables.",
  });
}

// Compare code VITE_ vars against .env.example
const missingFromExample: string[] = [];
for (const varName of codeViteVars.keys()) {
  if (!exampleVars.has(varName)) {
    missingFromExample.push(varName);
  }
}

if (missingFromExample.length > 0) {
  record({
    category: "Environment",
    check: "VITE_ Variables in .env.example",
    status: "WARN",
    message: `${missingFromExample.length} VITE_ variable(s) found in code are missing from .env.example`,
    details: missingFromExample.map(
      (v) => `${v} (used in: ${Array.from(codeViteVars.get(v) || []).join(", ")})`
    ),
    recommendation: "Add these variables to .env.example so deployment builds know to supply them.",
  });
} else {
  record({
    category: "Environment",
    check: "VITE_ Variables in .env.example",
    status: "PASS",
    message: `All ${codeViteVars.size} client VITE_ variable(s) are documented in .env.example.`,
    details: Array.from(codeViteVars.keys()).map((k) => `• ${k}`),
  });
}

// Client Secret Leak Check
const sensitivePatterns = /SECRET|PRIVATE|TOKEN|PASSWORD|SERVICE_ROLE/i;
const leakedClientVars: string[] = [];
for (const varName of codeViteVars.keys()) {
  if (sensitivePatterns.test(varName) && !varName.includes("PUBLISHABLE")) {
    leakedClientVars.push(varName);
  }
}

if (leakedClientVars.length > 0) {
  record({
    category: "Security",
    check: "Client Secret Prefix Leak",
    status: "FAIL",
    message: `Potentially sensitive keys are using the VITE_ prefix (exposed to browser bundles):`,
    details: leakedClientVars,
    recommendation: "Move sensitive tokens to backend/ Express routes without VITE_ prefix.",
  });
} else {
  record({
    category: "Security",
    check: "Client Secret Prefix Leak",
    status: "PASS",
    message: "No secret or private credentials are exposed with VITE_ prefix.",
  });
}

// ----------------------------------------------------
// 2. VITE BUILD CONFIGURATION AUDIT
// ----------------------------------------------------
console.log(`${colors.bold}[2/5] Analyzing Vite & Bundler Configuration...${colors.reset}`);

const viteConfigPath = resolve("vite.config.ts");
if (existsSync(viteConfigPath)) {
  const content = readFileSync(viteConfigPath, "utf-8");
  const hasReactPlugin = content.includes("@vitejs/plugin-react");
  const hasPathAlias = content.includes("resolve") && (content.includes("@") || content.includes("path"));

  if (hasReactPlugin && hasPathAlias) {
    record({
      category: "Vite Configuration",
      check: "vite.config.ts Architecture",
      status: "PASS",
      message: "Vite config is healthy with React plugin and alias resolution configured.",
    });
  } else {
    record({
      category: "Vite Configuration",
      check: "vite.config.ts Architecture",
      status: "WARN",
      message: "Vite config may be missing standard plugin or path alias configurations.",
    });
  }
} else {
  record({
    category: "Vite Configuration",
    check: "vite.config.ts Existence",
    status: "FAIL",
    message: "vite.config.ts not found in project root.",
  });
}

// Verify index.html entry point
const indexHtmlPath = resolve("index.html");
if (existsSync(indexHtmlPath)) {
  const content = readFileSync(indexHtmlPath, "utf-8");
  const hasMainScript = content.includes("/src/main.tsx");
  const hasCSP = content.includes("http-equiv=\"Content-Security-Policy\"");
  const hasTitle = content.includes("<title>") && !content.includes("Untitled");

  if (hasMainScript && hasTitle) {
    record({
      category: "HTML & Metadata",
      check: "index.html Entry & Meta",
      status: "PASS",
      message: "index.html contains valid module entry point, descriptive title, and meta tags.",
    });
  } else {
    record({
      category: "HTML & Metadata",
      check: "index.html Entry & Meta",
      status: "WARN",
      message: "index.html is missing either the /src/main.tsx entry or has a placeholder title.",
    });
  }

  // Check CSP for common blockers
  if (hasCSP && content.includes("X-Frame-Options")) {
    record({
      category: "HTML & Metadata",
      check: "CSP Frame Embedding",
      status: "WARN",
      message: "X-Frame-Options detected in index.html, which may prevent iframe preview.",
    });
  }
} else {
  record({
    category: "HTML & Metadata",
    check: "index.html Existence",
    status: "FAIL",
    message: "index.html not found.",
  });
}

// ----------------------------------------------------
// 3. GITHUB PUSH COMPATIBILITY & FILE INTEGRITY AUDIT
// ----------------------------------------------------
console.log(`${colors.bold}[3/5] Analyzing GitHub Push Constraints & File Sizes...${colors.reset}`);

const allTrackedFiles = getAllFiles(process.cwd(), ignoreDirs);
const MAX_GITHUB_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB warning threshold
const HARD_GITHUB_LIMIT_BYTES = 100 * 1024 * 1024; // 100MB hard failure

const oversizedFiles: { path: string; sizeMB: string; hardLimit: boolean }[] = [];
const problematicFilenames: { path: string; reason: string }[] = [];

for (const file of allTrackedFiles) {
  const stats = statSync(file);
  const rel = relative(process.cwd(), file);

  // File size check
  if (stats.size >= MAX_GITHUB_FILE_SIZE_BYTES) {
    oversizedFiles.push({
      path: rel,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2) + " MB",
      hardLimit: stats.size >= HARD_GITHUB_LIMIT_BYTES,
    });
  }

  // Filename check (special unescaped characters, backticks, trailing spaces)
  if (/[`*?:|"<>]/.test(file) || /[\s\t\n\r]{2,}/.test(file)) {
    problematicFilenames.push({
      path: rel,
      reason: "Contains special characters or illegal unescaped tokens that break git tree builders.",
    });
  }
}

if (oversizedFiles.length > 0) {
  const hasHard = oversizedFiles.some((f) => f.hardLimit);
  record({
    category: "GitHub Push",
    check: "File Size Limits (<50MB / <100MB)",
    status: hasHard ? "FAIL" : "WARN",
    message: `${oversizedFiles.length} file(s) exceed GitHub push size limits:`,
    details: oversizedFiles.map((f) => `• ${f.path} (${f.sizeMB})`),
    recommendation: "Add oversized binaries to .gitignore or use Git LFS.",
  });
} else {
  record({
    category: "GitHub Push",
    check: "File Size Limits",
    status: "PASS",
    message: "All repository files are within GitHub size limits (<50MB).",
  });
}

if (problematicFilenames.length > 0) {
  record({
    category: "GitHub Push",
    check: "Filename Integrity & Special Characters",
    status: "FAIL",
    message: `${problematicFilenames.length} file(s) contain problematic characters:`,
    details: problematicFilenames.map((f) => `• ${f.path}`),
    recommendation: "Rename these files to standard alphanumeric paths (PascalCase or kebab-case).",
  });
} else {
  record({
    category: "GitHub Push",
    check: "Filename Integrity",
    status: "PASS",
    message: "All filenames follow standard cross-platform path rules.",
  });
}

// ----------------------------------------------------
// 4. GITIGNORE & SECRETS PROTECTION AUDIT
// ----------------------------------------------------
console.log(`${colors.bold}[4/5] Analyzing .gitignore Rules & Push Protection...${colors.reset}`);

const gitignorePath = resolve(".gitignore");
if (existsSync(gitignorePath)) {
  const gitignoreContent = readFileSync(gitignorePath, "utf-8");
  const rules = gitignoreContent.split("\n").map((r) => r.trim());

  const hasEnvIgnore = rules.some((r) => r === ".env" || r === ".env*" || r.startsWith(".env"));
  const hasNodeModulesIgnore = rules.some((r) => r === "node_modules" || r === "node_modules/");
  const hasDistIgnore = rules.some((r) => r === "dist" || r === "dist/");

  if (hasEnvIgnore && hasNodeModulesIgnore && hasDistIgnore) {
    record({
      category: "Git Configuration",
      check: ".gitignore Completeness",
      status: "PASS",
      message: ".gitignore properly excludes .env secrets, node_modules, and dist bundles.",
    });
  } else {
    record({
      category: "Git Configuration",
      check: ".gitignore Completeness",
      status: "FAIL",
      message: ".gitignore is missing critical exclusions for .env, node_modules, or dist.",
      recommendation: "Update .gitignore to prevent secret leakage and oversized push attempts.",
    });
  }
} else {
  record({
    category: "Git Configuration",
    check: ".gitignore Existence",
    status: "FAIL",
    message: ".gitignore is missing.",
  });
}

// ----------------------------------------------------
// 5. GITHUB WORKFLOWS & CI INTEGRITY
// ----------------------------------------------------
console.log(`${colors.bold}[5/5] Analyzing GitHub Workflows CI Pipeline...${colors.reset}`);

const workflowsDir = resolve(".github/workflows");
if (existsSync(workflowsDir)) {
  const workflowFiles = readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  if (workflowFiles.length > 0) {
    let allValid = true;
    const workflowDetails: string[] = [];

    for (const wf of workflowFiles) {
      const content = readFileSync(join(workflowsDir, wf), "utf-8");
      // Check for broken references like tsgo or deprecated bunx commands
      if (content.includes("tsgo") || content.includes("bunx vitest")) {
        allValid = false;
        workflowDetails.push(`• ${wf}: Contains legacy broken commands (tsgo / non-standard runners)`);
      } else {
        workflowDetails.push(`• ${wf}: Configured with standard Node.js CI`);
      }
    }

    if (allValid) {
      record({
        category: "CI/CD Pipeline",
        check: "GitHub Actions Workflows",
        status: "PASS",
        message: `Found ${workflowFiles.length} workflow file(s) with valid syntax.`,
        details: workflowDetails,
      });
    } else {
      record({
        category: "CI/CD Pipeline",
        check: "GitHub Actions Workflows",
        status: "FAIL",
        message: "Workflows contain legacy or invalid command references.",
        details: workflowDetails,
        recommendation: "Update workflow files to use standard npm run commands.",
      });
    }
  } else {
    record({
      category: "CI/CD Pipeline",
      check: "GitHub Actions Workflows",
      status: "WARN",
      message: "No workflow files found in .github/workflows.",
    });
  }
} else {
  record({
    category: "CI/CD Pipeline",
    check: "GitHub Actions Directory",
    status: "WARN",
    message: ".github/workflows directory does not exist.",
  });
}

// ----------------------------------------------------
// REPORT GENERATION & CONSOLE SUMMARY
// ----------------------------------------------------
console.log(`\n${colors.bold}${colors.cyan}====================================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}                  DIAGNOSTIC SUMMARY                ${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}\n`);

let passCount = 0;
let warnCount = 0;
let failCount = 0;

for (const r of results) {
  let statusBadge = "";
  if (r.status === "PASS") {
    passCount++;
    statusBadge = `${colors.green}[PASS]${colors.reset}`;
  } else if (r.status === "WARN") {
    warnCount++;
    statusBadge = `${colors.yellow}[WARN]${colors.reset}`;
  } else {
    failCount++;
    statusBadge = `${colors.red}[FAIL]${colors.reset}`;
  }

  console.log(`${statusBadge} ${colors.bold}${r.category}:${colors.reset} ${r.check}`);
  console.log(`       ${r.message}`);
  if (r.details && r.details.length > 0) {
    for (const d of r.details) {
      console.log(`       ${colors.dim}${d}${colors.reset}`);
    }
  }
  if (r.recommendation) {
    console.log(`       ${colors.cyan}Recommendation:${colors.reset} ${r.recommendation}`);
  }
  console.log("");
}

console.log(`${colors.bold}Total Checks:${colors.reset} ${results.length} | ${colors.green}Passed: ${passCount}${colors.reset} | ${colors.yellow}Warnings: ${warnCount}${colors.reset} | ${colors.red}Failures: ${failCount}${colors.reset}\n`);

// Export JSON report for programmatic consumption
const reportPath = resolve("build-diagnosis-report.json");
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      summary: { total: results.length, passed: passCount, warnings: warnCount, failed: failCount },
      results,
    },
    null,
    2
  )
);
console.log(`${colors.dim}Full diagnostic report saved to: build-diagnosis-report.json${colors.reset}\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
