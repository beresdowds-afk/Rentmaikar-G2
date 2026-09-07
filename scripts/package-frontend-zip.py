#!/usr/bin/env python3
import os
import zipfile
import shutil

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_DIR = os.path.join(ROOT_DIR, "public", "downloads")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SOURCE_ZIP_PATH = os.path.join(OUTPUT_DIR, "rentmaikar-frontend.zip")
DIST_ZIP_PATH = os.path.join(OUTPUT_DIR, "rentmaikar-frontend-production-build.zip")
COMPLETE_ZIP_PATH = os.path.join(OUTPUT_DIR, "rentmaikar-frontend-complete.zip")

README_CONTENT = """# RentMaikar Standalone Frontend

This archive contains all the frontend source files for RentMaikar, configured to run standalone on `rentmaikar.com` and seamlessly communicate with the backend at `staging.rentmaikar.com`.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Development server:
   ```bash
   npm run dev
   ```

3. Production Build:
   ```bash
   npm run build
   ```
   The compiled static files will be placed in the `dist/` directory.

## Backend Bridge Architecture

The application includes the resilient Backend Bridge (`src/lib/backend-bridge.ts`):
- When hosted on `rentmaikar.com` separately from the backend, it automatically directs API traffic and SSE streams to `https://staging.rentmaikar.com/api`.
- If direct contact is lost, it trips into `STAGING_FALLBACK` mode with zero dropped user mutations, exponential retry backoff, and live event synchronization.

## Hosting on `rentmaikar.com`

You can deploy the built `dist/` folder to any static hosting provider:
- **Cloudflare Pages / Workers**: Set root to `dist/`, redirect all paths to `index.html` (SPA fallback).
- **Vercel / Netlify**: Configure Single Page Application rewrite `/* -> /index.html`.
- **Nginx**: Use the provided `frontend/nginx.conf` or standard `try_files $uri $uri/ /index.html;`.
- **Docker**: Build using `frontend/Dockerfile`.
"""

EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    ".github",
    ".cache",
    "downloads",
    "backend",
    "tests",
}

EXCLUDE_EXTENSIONS = {
    ".pyc",
    ".swp",
    ".log",
    ".DS_Store",
}

def should_skip(path):
    parts = os.path.normpath(path).split(os.sep)
    for p in parts:
        if p in EXCLUDE_DIRS:
            return True
    _, ext = os.path.splitext(path)
    if ext in EXCLUDE_EXTENSIONS:
        return True
    return False

def build_source_zip():
    print(f"Generating source zip: {SOURCE_ZIP_PATH}...")
    with zipfile.ZipFile(SOURCE_ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zipf:
        # Write README
        zipf.writestr("STANDALONE_HOSTING_README.md", README_CONTENT)

        # Explicit root files
        root_files = [
            "index.html",
            "package.json",
            "package-lock.json",
            "vite.config.ts",
            "tailwind.config.ts",
            "postcss.config.js",
            "tsconfig.json",
            "tsconfig.app.json",
            "tsconfig.node.json",
            "components.json",
            "eslint.config.js",
            ".env.example",
            "CNAME",
            "README.md",
        ]

        for fname in root_files:
            fpath = os.path.join(ROOT_DIR, fname)
            if os.path.isfile(fpath):
                zipf.write(fpath, arcname=fname)

        # Include src/
        src_dir = os.path.join(ROOT_DIR, "src")
        for root, dirs, files in os.walk(src_dir):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in files:
                if should_skip(file):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, ROOT_DIR)
                zipf.write(full_path, arcname=rel_path)

        # Include public/ (excluding downloads)
        pub_dir = os.path.join(ROOT_DIR, "public")
        for root, dirs, files in os.walk(pub_dir):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in files:
                if should_skip(file):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, ROOT_DIR)
                zipf.write(full_path, arcname=rel_path)

        # Include frontend/ deployment configs
        fe_dir = os.path.join(ROOT_DIR, "frontend")
        if os.path.isdir(fe_dir):
            for root, dirs, files in os.walk(fe_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, ROOT_DIR)
                    zipf.write(full_path, arcname=rel_path)

    size_mb = os.path.getsize(SOURCE_ZIP_PATH) / (1024 * 1024)
    print(f"Created {SOURCE_ZIP_PATH} ({size_mb:.2f} MB)")

def build_dist_zip():
    dist_dir = os.path.join(ROOT_DIR, "dist")
    if not os.path.isdir(dist_dir):
        print("dist directory not found, skipping dist zip.")
        return

    print(f"Generating production build zip: {DIST_ZIP_PATH}...")
    with zipfile.ZipFile(DIST_ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("STANDALONE_HOSTING_README.md", README_CONTENT)
        for root, dirs, files in os.walk(dist_dir):
            # Skip downloads inside dist if copied
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in files:
                if should_skip(file):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, dist_dir)
                zipf.write(full_path, arcname=rel_path)

    size_mb = os.path.getsize(DIST_ZIP_PATH) / (1024 * 1024)
    print(f"Created {DIST_ZIP_PATH} ({size_mb:.2f} MB)")

def build_complete_zip():
    print(f"Generating complete bundle (source + dist): {COMPLETE_ZIP_PATH}...")
    with zipfile.ZipFile(COMPLETE_ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("STANDALONE_HOSTING_README.md", README_CONTENT)

        # Add source files under source/
        root_files = [
            "index.html",
            "package.json",
            "package-lock.json",
            "vite.config.ts",
            "tailwind.config.ts",
            "postcss.config.js",
            "tsconfig.json",
            "tsconfig.app.json",
            "tsconfig.node.json",
            "components.json",
            "eslint.config.js",
            ".env.example",
            "CNAME",
            "README.md",
        ]
        for fname in root_files:
            fpath = os.path.join(ROOT_DIR, fname)
            if os.path.isfile(fpath):
                zipf.write(fpath, arcname=os.path.join("source", fname))

        for folder in ["src", "public", "frontend"]:
            fdir = os.path.join(ROOT_DIR, folder)
            if os.path.isdir(fdir):
                for root, dirs, files in os.walk(fdir):
                    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                    for file in files:
                        if should_skip(file):
                            continue
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, ROOT_DIR)
                        zipf.write(full_path, arcname=os.path.join("source", rel_path))

        # Add dist files under production-build/
        dist_dir = os.path.join(ROOT_DIR, "dist")
        if os.path.isdir(dist_dir):
            for root, dirs, files in os.walk(dist_dir):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for file in files:
                    if should_skip(file):
                        continue
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, dist_dir)
                    zipf.write(full_path, arcname=os.path.join("production-build", rel_path))

    size_mb = os.path.getsize(COMPLETE_ZIP_PATH) / (1024 * 1024)
    print(f"Created {COMPLETE_ZIP_PATH} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    build_source_zip()
    build_dist_zip()
    build_complete_zip()
    print("All zip archives generated successfully!")
