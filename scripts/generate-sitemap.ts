// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  STATIC_SITEMAP_ROUTES,
  fetchVehicleSitemapEntries,
  formatXmlSitemap,
} from "../src/lib/seo/sitemapEngine";

// Node doesn't read .env the way Vite does — load the publishable keys manually.
if (existsSync(resolve(".env"))) {
  for (const line of readFileSync(resolve(".env"), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function run() {
  try {
    const dynamic = await fetchVehicleSitemapEntries();
    const all = [...STATIC_SITEMAP_ROUTES, ...dynamic];
    const publicDir = resolve("public");
    if (!existsSync(publicDir)) {
      mkdirSync(publicDir, { recursive: true });
    }
    const xml = formatXmlSitemap(all);
    writeFileSync(resolve("public/sitemap.xml"), xml);
    console.log(`[Sitemap] Generated public/sitemap.xml with ${all.length} entries (${dynamic.length} dynamic vehicles).`);
  } catch (err: any) {
    console.warn("[Sitemap] Generation warning (non-fatal):", err?.message || err);
  }
}

run();
