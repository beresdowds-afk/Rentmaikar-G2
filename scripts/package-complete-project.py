#!/usr/bin/env python3
import os
import zipfile
import sys

def package_project():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_dir = os.path.join(root_dir, "public", "downloads")
    os.makedirs(out_dir, exist_ok=True)
    zip_path = os.path.join(out_dir, "rentmaikar-complete-project.zip")

    exclude_dirs = {
        "node_modules",
        ".git",
        ".cache",
        ".temp",
        "dist",
        "dist-ssr",
        "coverage",
        "test-results",
        "playwright-report",
        "blob-report",
        "downloads",
    }

    exclude_exts = {
        ".pyc",
        ".DS_Store",
        ".swp",
        ".log",
    }

    exclude_files = {
        "rentmaikar-complete-project.zip",
        "rentmaikar-frontend.zip",
        "rentmaikar-frontend-production-build.zip",
        "rentmaikar-frontend-complete.zip",
        "build-diagnosis-report.json",
    }

    print(f"Packaging complete Rentmaikar project from {root_dir}...")
    file_count = 0
    total_uncompressed_bytes = 0

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Prune excluded directories
            dirnames[:] = [d for d in dirnames if d not in exclude_dirs and not d.startswith(".")]

            rel_dir = os.path.relpath(dirpath, root_dir)
            if rel_dir.startswith("public/downloads"):
                continue

            for filename in filenames:
                if filename in exclude_files:
                    continue
                _, ext = os.path.splitext(filename)
                if ext in exclude_exts:
                    continue
                if filename.startswith(".env") and filename != ".env.example":
                    # Do not package private local .env secrets
                    continue

                full_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(full_path, root_dir)

                try:
                    zf.write(full_path, arcname=rel_path)
                    file_count += 1
                    total_uncompressed_bytes += os.path.getsize(full_path)
                except Exception as e:
                    print(f"Warning: could not add {rel_path}: {e}")

    zip_size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"Successfully created {zip_path}")
    print(f"Total files: {file_count}")
    print(f"Uncompressed size: {total_uncompressed_bytes / (1024 * 1024):.2f} MB")
    print(f"Compressed ZIP size: {zip_size_mb:.2f} MB")

if __name__ == "__main__":
    package_project()
