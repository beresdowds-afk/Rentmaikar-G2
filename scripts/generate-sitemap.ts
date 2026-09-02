// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://rentmaikar.com";

// Node doesn't read .env the way Vite does — load the publishable keys manually.
if (existsSync(resolve(".env"))) {
  for (const line of readFileSync(resolve(".env"), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Public, indexable routes only. Auth, dashboards, onboarding, admin,
// support and portal routes are intentionally excluded.
const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.8" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/guides/renting-vs-owning-for-rideshare", changefreq: "monthly", priority: "0.7" },
  { path: "/catalogue/budget", changefreq: "daily", priority: "0.9" },
  { path: "/catalogue/standard", changefreq: "daily", priority: "0.9" },
  { path: "/catalogue/premium", changefreq: "daily", priority: "0.9" },
  { path: "/driver/register", changefreq: "monthly", priority: "0.8" },
  { path: "/owner/register", changefreq: "monthly", priority: "0.8" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/sms-opt-in", changefreq: "yearly", priority: "0.3" },
];

/**
 * Dynamic routes: one /vehicle/:id entry per publicly visible listing.
 * Mirrors the Catalogue/VehicleDetails data source (public_vehicle_listings),
 * which already filters to published listings with photos.
 * Network failures are non-fatal — the static routes still ship.
 */
async function fetchVehicleEntries(): Promise<SitemapEntry[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];

  try {
    const res = await fetch(
      `${url}/rest/v1/public_vehicle_listings?select=id&limit=5000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as { id: string }[];
    return rows
      .filter((r) => r?.id)
      .map((r) => ({
        path: `/vehicle/${r.id}`,
        changefreq: "weekly" as const,
        priority: "0.6",
      }));
  } catch (err) {
    console.warn("sitemap: skipped vehicle listings —", (err as Error).message);
    return [];
  }
}

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

try {
  const dynamic = await fetchVehicleEntries();
  const all = [...entries, ...dynamic];
  const publicDir = resolve("public");
  if (!existsSync(publicDir)) {
    const { mkdirSync } = await import("fs");
    mkdirSync(publicDir, { recursive: true });
  }
  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(all));
  console.log(`sitemap.xml written (${all.length} entries)`);
} catch (err) {
  console.warn("sitemap generation warning (non-fatal):", (err as Error).message);
}

