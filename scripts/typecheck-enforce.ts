
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

const packageJsonPath = resolve(projectRoot, "package.json");
const compilerPath = resolve(
  projectRoot,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);

function fail(message: string): never {
  console.error(`[typecheck-enforce] ERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(packageJsonPath)) {
  fail(`Root package.json not found at ${packageJsonPath}`);
}

if (!existsSync(compilerPath)) {
  fail(
    "TypeScript compiler not found. Install root dependencies before running typecheck.",
  );
}

console.log("[typecheck-enforce] Running TypeScript compiler with --noEmit.");

const result = spawnSync(
  process.execPath,
  [compilerPath, "--noEmit"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) {
  fail(`Could not start TypeScript: ${result.error.message}`);
}

if (result.signal) {
  fail(`TypeScript terminated unexpectedly with signal ${result.signal}`);
}

if (result.status === null) {
  fail("TypeScript exited without returning an exit status.");
}

if (result.status !== 0) {
  process.exit(result.status);
}

console.log("[typecheck-enforce] TypeScript check passed.");
