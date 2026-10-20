import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real typecheck of the application and backend projects.
 *
 * The root tsconfig.json only holds project references (files: []), so a bare
 * `tsc --noEmit` there checks nothing. This script checks:
 *   1. backend/tsconfig.json  - must be error-free.
 *   2. tsconfig.app.json      - errors are compared with the committed
 *      baseline (scripts/typecheck-app-baseline.txt) of PRE-EXISTING errors.
 *      Any error not in the baseline fails the check (a ratchet: strict
 *      options are not relaxed and new errors cannot be introduced).
 *      Shrink the baseline as errors are fixed.
 */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message: string): never {
  console.error(`[typecheck-enforce] ERROR: ${message}`);
  process.exit(1);
}

function findTsc(dir: string): string {
  for (const base of [dir, projectRoot]) {
    const p = resolve(base, "node_modules", "typescript", "bin", "tsc");
    if (existsSync(p)) return p;
  }
  return fail(`TypeScript compiler not found for ${dir}. Install dependencies first.`);
}

function run(cwd: string, args: string[]) {
  const r = spawnSync(process.execPath, [findTsc(cwd), ...args], {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) fail(`Could not start TypeScript: ${r.error.message}`);
  if (r.status === null) fail("TypeScript terminated unexpectedly.");
  return r;
}

const backendDir = resolve(projectRoot, "backend");
if (!existsSync(resolve(backendDir, "node_modules"))) {
  console.log("[typecheck-enforce] Installing backend dependencies...");
  spawnSync("npm", ["install"], { cwd: backendDir, stdio: "inherit" });
}

console.log("[typecheck-enforce] backend: tsc --noEmit");
const backend = run(backendDir, ["--noEmit"]);
process.stdout.write(backend.stdout);
process.stderr.write(backend.stderr);
if (backend.status !== 0) fail("backend typecheck failed.");

console.log("[typecheck-enforce] app: tsc -p tsconfig.app.json --noEmit");
const app = run(projectRoot, ["-p", "tsconfig.app.json", "--noEmit"]);
const errors = (app.stdout + app.stderr)
  .split("\n")
  .filter((l) => /error TS\d+/.test(l))
  .map((l) => l.replace(/^([^(]+)\(\d+,\d+\): /, "$1: ").trim());

const baselinePath = resolve(projectRoot, "scripts", "typecheck-app-baseline.txt");
const baseline = new Set(
  existsSync(baselinePath) ? readFileSync(baselinePath, "utf8").split("\n").filter(Boolean) : [],
);
const fresh = [...new Set(errors)].filter((e) => !baseline.has(e));
if (fresh.length > 0) {
  console.error(fresh.join("\n"));
  fail(`${fresh.length} new app type error(s) not in the baseline.`);
}
if (app.status !== 0 && errors.length === 0) {
  process.stderr.write(app.stdout + app.stderr);
  fail("app typecheck failed without parsable errors.");
}
console.log(
  `[typecheck-enforce] passed (${errors.length} known pre-existing app errors in baseline, 0 new).`,
);
