#!/usr/bin/env python3
"""Scan the server codebase for environment usage and per-function metadata.

Writes scratch artifacts consumed by generate-handoff-docs.py and
generate-openapi.py:

  /tmp/handoff/functions.json  per-edge-function env, shared imports, methods, auth signals
  /tmp/handoff/deno-env.txt    every env var read by edge functions (incl. via _shared)
  /tmp/handoff/node-env.txt    every env var read by the Express gateway

Run from the project root:  python3 scripts/handoff/scan-env.py
"""
import os
import re
import json
import subprocess

ROOT = os.getcwd()
BASE = os.path.join(ROOT, "supabase/functions")
SCRATCH = "/tmp/handoff"
ENV_RE = r"Deno\.env\.get\([\'\"]([A-Z0-9_]+)[\'\"]\)"

os.makedirs(SCRATCH, exist_ok=True)

# Env vars each _shared module reads, so importing functions inherit them.
shared_env = {}
shared_dir = os.path.join(BASE, "_shared")
for f in os.listdir(shared_dir):
    if f.endswith(".ts"):
        src = open(os.path.join(shared_dir, f), encoding="utf8", errors="ignore").read()
        shared_env[f[:-3]] = sorted(set(re.findall(ENV_RE, src)))

out = {}
for fn in sorted(os.listdir(BASE)):
    d = os.path.join(BASE, fn)
    if fn.startswith("_") or not os.path.isdir(d):
        continue
    src = ""
    for root, _, files in os.walk(d):
        for f in files:
            if f.endswith(".ts"):
                src += open(os.path.join(root, f), encoding="utf8", errors="ignore").read()
    env = set(re.findall(ENV_RE, src))
    imports = sorted(set(re.findall(r'from "\.\./_shared/([\w-]+)\.ts"', src)))
    for i in imports:
        env |= set(shared_env.get(i, []))
    auth = []
    if "verify_cron_token" in src or "CRON_SECRET" in src:
        auth.append("cron-token")
    if "auth.getUser" in src or ("Authorization" in src and "Bearer" in src):
        auth.append("jwt")
    if re.search(r"hmac|createHmac|verifySignature|signature", src, re.I):
        auth.append("provider-signature")
    if "SUPABASE_SERVICE_ROLE_KEY" in src:
        auth.append("service-role")
    out[fn] = {
        "env": sorted(env),
        "shared": imports,
        "methods": sorted(set(re.findall(r'req\.method\s*===\s*"(\w+)"', src))),
        "auth": sorted(set(auth)),
        "lines": src.count("\n"),
    }

json.dump(out, open(f"{SCRATCH}/functions.json", "w"), indent=1)
all_env = sorted({e for m in out.values() for e in m["env"]})
open(f"{SCRATCH}/deno-env.txt", "w").write("\n".join(all_env) + "\n")

node = subprocess.run(
    ["rg", "-o", r"process\.env\.[A-Z0-9_]+", "backend/src", "--no-filename"],
    capture_output=True, text=True, cwd=ROOT,
).stdout
node_env = sorted({l.split(".")[-1] for l in node.splitlines() if l.strip()})
open(f"{SCRATCH}/node-env.txt", "w").write("\n".join(node_env) + "\n")

print(f"functions: {len(out)}  edge env vars: {len(all_env)}  gateway env vars: {len(node_env)}")
