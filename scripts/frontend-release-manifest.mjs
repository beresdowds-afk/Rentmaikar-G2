import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const manifestName = "release-manifest.json";
const hash = (data) => createHash("sha256").update(data).digest("hex");
class ReleaseError extends Error {}
const validPath = (path) =>
  typeof path === "string" &&
  /^[A-Za-z0-9._/-]+$/.test(path) &&
  path.split("/").every((part) => part && part !== "." && part !== "..");

async function listFiles(root, prefix = "") {
  const files = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (!validPath(path)) throw new ReleaseError("Unsupported artifact path");
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw new ReleaseError("Artifact contains a symbolic link");
    if (stat.isDirectory()) files.push(...await listFiles(root, path));
    else if (stat.isFile() && path !== manifestName) files.push(path);
    else if (!stat.isFile()) throw new ReleaseError("Artifact contains a non-file");
  }
  return files;
}

function artifactHash(files) {
  return hash(JSON.stringify(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}

function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 ||
      !/^[a-f0-9]{40}$/.test(manifest.commit) ||
      !Number.isFinite(Date.parse(manifest.builtAt)) ||
      !manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
    throw new ReleaseError("Invalid release manifest");
  }
  const entries = Object.entries(manifest.files);
  if (!entries.length || entries.some(([path, digest]) =>
    !validPath(path) || path === manifestName || !/^[a-f0-9]{64}$/.test(digest))) {
    throw new ReleaseError("Invalid artifact file list");
  }
  const computed = artifactHash(manifest.files);
  if (manifest.artifactSha256 !== computed ||
      manifest.releaseId !== `${manifest.commit}-${computed.slice(0, 16)}` ||
      !manifest.files["index.html"] ||
      !validPath(manifest.mainBundle) ||
      !manifest.mainBundle.endsWith(".js") ||
      !manifest.files[manifest.mainBundle]) {
    throw new ReleaseError("Inconsistent release manifest");
  }
}

function htmlAssets(html) {
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']\/(assets\/[^"'?#]+)(?:[?#][^"']*)?["']/gi)]
    .map((match) => match[1]);
  const main = html.match(/<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*\bsrc\s*=\s*["']\/(assets\/[^"'?#]+\.js)(?:[?#][^"']*)?["'][^>]*>/i);
  if (!main || !refs.every(validPath)) throw new ReleaseError("HTML has no valid module entry");
  return { refs, main: main[1] };
}

export async function createManifest(directory, commit, builtAt = new Date().toISOString()) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !Number.isFinite(Date.parse(builtAt))) {
    throw new ReleaseError("Invalid commit or build timestamp");
  }
  const files = Object.create(null);
  for (const path of await listFiles(directory)) files[path] = hash(await readFile(join(directory, path)));
  const { refs, main } = htmlAssets(await readFile(join(directory, "index.html"), "utf8"));
  if (refs.some((path) => !files[path])) throw new ReleaseError("HTML references a missing artifact");
  const artifactSha256 = artifactHash(files);
  const manifest = {
    version: 1,
    commit,
    builtAt,
    releaseId: `${commit}-${artifactSha256.slice(0, 16)}`,
    artifactSha256,
    mainBundle: main,
    files,
  };
  validateManifest(manifest);
  await writeFile(join(directory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function fetchFile(fetcher, base, path) {
  const url = new URL(path.split("/").map(encodeURIComponent).join("/"), `${base.origin}/`);
  const response = await fetcher(url, { signal: AbortSignal.timeout(30000), cache: "no-store", redirect: "error" });
  if (!response.ok) throw new ReleaseError("Deployment resource unavailable");
  return Buffer.from(await response.arrayBuffer());
}

export async function verifyDeployment(manifest, origin, fetcher = fetch) {
  validateManifest(manifest);
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password ||
      base.pathname !== "/" || base.search || base.hash) throw new ReleaseError("Invalid deployment origin");
  const liveManifest = JSON.parse((await fetchFile(fetcher, base, manifestName)).toString("utf8"));
  validateManifest(liveManifest);
  if (JSON.stringify(liveManifest) !== JSON.stringify(manifest)) throw new ReleaseError("Release manifest differs");
  const index = await fetchFile(fetcher, base, "");
  if (hash(index) !== manifest.files["index.html"]) throw new ReleaseError("HTML differs");
  const { refs, main } = htmlAssets(index.toString("utf8"));
  if (main !== manifest.mainBundle || refs.some((path) => !manifest.files[path])) {
    throw new ReleaseError("HTML asset references differ");
  }
  for (const [path, expected] of Object.entries(manifest.files)) {
    if (!/\.(?:js|css)$/.test(path)) continue;
    if (hash(await fetchFile(fetcher, base, path)) !== expected) throw new ReleaseError("JavaScript or CSS differs");
  }
  return { releaseId: manifest.releaseId, mainBundleSha256: manifest.files[manifest.mainBundle] };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "create" && args.length === 2) {
    const manifest = await createManifest(args[0], args[1]);
    console.log(`Created release ${manifest.releaseId}`);
  } else if (command === "verify" && args.length === 2) {
    const manifest = JSON.parse(await readFile(args[0], "utf8"));
    const result = await verifyDeployment(manifest, args[1]);
    console.log(`Asset integrity verified for release ${result.releaseId}; main SHA-256 ${result.mainBundleSha256}`);
    console.log("Configuration, non-JS/CSS resources and application behavior require separate verification.");
  } else {
    throw new ReleaseError("Usage: frontend-release-manifest.mjs create DIST COMMIT | verify MANIFEST ORIGIN");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof ReleaseError
      ? `Frontend release operation failed: ${error.message}`
      : "Frontend release operation failed; check artifact and deployment access.");
    process.exitCode = 1;
  });
}
