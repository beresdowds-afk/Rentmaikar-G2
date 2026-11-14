import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { createManifest, verifyDeployment } from "./frontend-release-manifest.mjs";

const commit = "a".repeat(40);
const timestamp = "2026-01-01T00:00:00.000Z";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "rentmaikar-release-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "index.html"), '<script type="module" src="/assets/index.js"></script><link href="/assets/app.css">');
  await writeFile(join(dir, "assets/index.js"), 'import("./chunk.js")');
  await writeFile(join(dir, "assets/chunk.js"), "export const x = 1;");
  await writeFile(join(dir, "assets/app.css"), "body{}");
  return dir;
}

async function fakeDeployment(dir, overrides = {}) {
  return async (url) => {
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (path in overrides) {
      const value = overrides[path];
      return new Response(value === null ? "" : value, { status: value === null ? 404 : 200 });
    }
    return new Response(await readFile(join(dir, path)));
  };
}

test("manifest is reproducible for identical files and records every artifact", async (t) => {
  const dir = await fixture(t);
  const first = await createManifest(dir, commit, timestamp);
  const second = await createManifest(dir, commit, timestamp);
  assert.deepEqual(second, first);
  assert.equal(Object.keys(first.files).length, 4);
  assert.equal(first.mainBundle, "assets/index.js");
  assert.match(first.artifactSha256, /^[0-9a-f]{64}$/);
  assert.ok(first.releaseId.startsWith(commit));
});

test("verification checks HTML, main bundle, lazy chunks and CSS", async (t) => {
  const dir = await fixture(t);
  const manifest = await createManifest(dir, commit, timestamp);
  const fetcher = await fakeDeployment(dir);
  const result = await verifyDeployment(manifest, "https://example.test", fetcher);
  assert.equal(result.releaseId, manifest.releaseId);
  assert.equal(result.mainBundleSha256, manifest.files["assets/index.js"]);
  for (const path of ["index.html", "assets/index.js", "assets/chunk.js", "assets/app.css"]) {
    await assert.rejects(verifyDeployment(manifest, "https://example.test", await fakeDeployment(dir, { [path]: "drift" })));
    await assert.rejects(verifyDeployment(manifest, "https://example.test", await fakeDeployment(dir, { [path]: null })));
  }
});

test("verification rejects another release or tampered manifest", async (t) => {
  const dir = await fixture(t);
  const manifest = await createManifest(dir, commit, timestamp);
  const changed = { ...manifest, releaseId: "b".repeat(40) + "-" + manifest.artifactSha256.slice(0, 16) };
  await assert.rejects(verifyDeployment(manifest, "https://example.test", await fakeDeployment(dir, {
    "release-manifest.json": JSON.stringify(changed),
  })));
  await assert.rejects(verifyDeployment({ ...manifest, artifactSha256: "0".repeat(64) }, "https://example.test"));
  const other = { ...manifest, builtAt: "2026-01-02T00:00:00.000Z" };
  await assert.rejects(verifyDeployment(manifest, "https://example.test", await fakeDeployment(dir, {
    "release-manifest.json": JSON.stringify(other),
  })), /manifest differs/);
});

test("verification distinguishes a healthy deployment from a drifted deployment", async (t) => {
  const dir = await fixture(t);
  const manifest = await createManifest(dir, commit, timestamp);
  const results = await Promise.allSettled([
    verifyDeployment(manifest, "https://public.test", await fakeDeployment(dir)),
    verifyDeployment(manifest, "https://g2.test", await fakeDeployment(dir, { "assets/chunk.js": "stale" })),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected"]);
});

test("missing HTML references and symlinks are rejected", async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, "index.html"), '<script type="module" src="/assets/missing.js"></script>');
  await assert.rejects(createManifest(dir, commit, timestamp), /missing artifact/);
  await writeFile(join(dir, "index.html"), '<script type="module" src="/assets/index.js"></script>');
  await symlink("index.js", join(dir, "assets/link.js"));
  await assert.rejects(createManifest(dir, commit, timestamp), /symbolic link/);
});

test("CLI failures do not print sensitive input", () => {
  const secret = "sensitive-test-value";
  const result = spawnSync(process.execPath, ["scripts/frontend-release-manifest.mjs", "verify", secret, secret], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});
