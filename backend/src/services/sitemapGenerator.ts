/**
 * RentMaikar Server-Side XML Sitemap Generator
 * 
 * Generates dynamic, standards-compliant XML sitemaps following the Sitemaps.org 0.9 protocol
 * and Google Image Sitemap 1.1 extensions. Dynamically incorporates published vehicle listings
 * from Supabase with resilient in-memory caching and zero-dependency fallbacks.
 */

export interface SitemapRoute {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  lastmod?: string;
  images?: Array<{
    loc: string;
    title?: string;
    caption?: string;
  }>;
}

export const BASE_SITE_URL = "https://rentmaikar.com";

/**
 * Public, indexable static marketing and discovery routes.
 * Auth gates, customer dashboards, and internal portal routes are intentionally excluded.
 */
export const STATIC_SITEMAP_ROUTES: SitemapRoute[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/catalogue", changefreq: "daily", priority: "0.9" },
  { path: "/catalogue/budget", changefreq: "daily", priority: "0.9" },
  { path: "/catalogue/standard", changefreq: "daily", priority: "0.9" },
  { path: "/catalogue/premium", changefreq: "daily", priority: "0.9" },
  { path: "/how-it-works", changefreq: "weekly", priority: "0.8" },
  { path: "/driver/register", changefreq: "monthly", priority: "0.8" },
  { path: "/owner/register", changefreq: "monthly", priority: "0.8" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/guides/renting-vs-owning-for-rideshare", changefreq: "monthly", priority: "0.7" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/sms-opt-in", changefreq: "yearly", priority: "0.3" },
];

interface CachedSitemap {
  xml: string;
  generatedAt: number;
  count: number;
}

let memoryCache: CachedSitemap | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

/**
 * Safely escape XML characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Fetch published vehicles dynamically from Supabase
 */
export async function fetchPublishedVehicleRoutes(): Promise<SitemapRoute[]> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || "https://jrsydiofzceoeddjogov.supabase.co";
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `${supabaseUrl}/rest/v1/public_vehicle_listings?select=id,make,model,year,photo_urls,created_at&limit=5000`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Sitemap] Supabase returned status ${res.status}`);
      return [];
    }

    const rows = (await res.json()) as Array<{
      id: string;
      make?: string;
      model?: string;
      year?: number;
      photo_urls?: string[];
      created_at?: string;
    }>;

    return rows
      .filter((r) => r && r.id)
      .map((r) => {
        const title = `${r.year || ""} ${r.make || ""} ${r.model || ""}`.trim() || "Vehicle Rental";
        const images = (r.photo_urls || [])
          .filter((p) => typeof p === "string" && p.startsWith("http"))
          .slice(0, 5)
          .map((img) => ({
            loc: img,
            title,
            caption: `${title} available for rideshare rental on RentMaikar`,
          }));

        let lastmod: string | undefined;
        if (r.created_at) {
          try {
            lastmod = new Date(r.created_at).toISOString().split("T")[0];
          } catch {
            // ignore invalid date
          }
        }

        return {
          path: `/vehicle/${r.id}`,
          changefreq: "weekly" as const,
          priority: "0.8",
          lastmod,
          images: images.length > 0 ? images : undefined,
        };
      });
  } catch (err: any) {
    console.warn(`[Sitemap] Skipped dynamic vehicles: ${err?.message || err}`);
    return [];
  }
}

/**
 * Build the XML sitemap document
 */
export function buildSitemapXml(routes: SitemapRoute[]): string {
  const today = new Date().toISOString().split("T")[0];

  const urlBlocks = routes.map((r) => {
    const loc = `${BASE_SITE_URL}${r.path === "/" ? "" : r.path}`;
    const lastmod = r.lastmod || today;
    const changefreq = r.changefreq || "weekly";
    const priority = r.priority || "0.5";

    const lines = [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
      `    <changefreq>${escapeXml(changefreq)}</changefreq>`,
      `    <priority>${escapeXml(priority)}</priority>`,
    ];

    if (r.images && r.images.length > 0) {
      for (const img of r.images) {
        lines.push("    <image:image>");
        lines.push(`      <image:loc>${escapeXml(img.loc)}</image:loc>`);
        if (img.title) {
          lines.push(`      <image:title>${escapeXml(img.title)}</image:title>`);
        }
        if (img.caption) {
          lines.push(`      <image:caption>${escapeXml(img.caption)}</image:caption>`);
        }
        lines.push("    </image:image>");
      }
    }

    lines.push("  </url>");
    return lines.join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    `  <!-- RentMaikar Dynamic XML Sitemap - Auto-generated server-side -->`,
    ...urlBlocks,
    `</urlset>`,
  ].join("\n");
}

/**
 * Generate or return cached XML sitemap
 */
export async function generateServerSitemap(forceFresh = false): Promise<{ xml: string; count: number; cached: boolean }> {
  const now = Date.now();

  if (!forceFresh && memoryCache && now - memoryCache.generatedAt < CACHE_TTL_MS) {
    return {
      xml: memoryCache.xml,
      count: memoryCache.count,
      cached: true,
    };
  }

  const dynamicVehicles = await fetchPublishedVehicleRoutes();
  const allRoutes = [...STATIC_SITEMAP_ROUTES, ...dynamicVehicles];
  const xml = buildSitemapXml(allRoutes);

  memoryCache = {
    xml,
    generatedAt: now,
    count: allRoutes.length,
  };

  return {
    xml,
    count: allRoutes.length,
    cached: false,
  };
}
