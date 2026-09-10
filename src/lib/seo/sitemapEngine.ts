/**
 * RentMaikar Sitemap Generator Engine
 * 
 * Generates standards-compliant XML sitemaps including all static pages,
 * catalogue tiers, and dynamic vehicle rental listings.
 */

export interface SitemapEntry {
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

export const STATIC_SITEMAP_ROUTES: SitemapEntry[] = [
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

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function fetchVehicleSitemapEntries(supabaseUrl?: string, supabaseKey?: string): Promise<SitemapEntry[]> {
  const url = supabaseUrl || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || "https://jrsydiofzceoeddjogov.supabase.co";
  const key = supabaseKey || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `${url}/rest/v1/public_vehicle_listings?select=id,make,model,year,photo_urls,created_at&limit=5000`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
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
            // ignore
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
    console.warn("[Sitemap] Could not fetch dynamic vehicle listings:", err?.message || err);
    return [];
  }
}

export function formatXmlSitemap(entries: SitemapEntry[]): string {
  const today = new Date().toISOString().split("T")[0];

  const urls = entries.map((e) => {
    const loc = `${BASE_SITE_URL}${e.path === "/" ? "" : e.path}`;
    const lastmod = e.lastmod || today;
    const changefreq = e.changefreq || "weekly";
    const priority = e.priority || "0.6";

    const lines = [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
      `    <changefreq>${escapeXml(changefreq)}</changefreq>`,
      `    <priority>${escapeXml(priority)}</priority>`,
    ];

    if (e.images && e.images.length > 0) {
      for (const img of e.images) {
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
    `  <!-- RentMaikar Server-Side XML Sitemap -->`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}
