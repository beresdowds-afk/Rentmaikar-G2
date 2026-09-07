import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// vite-plugin-pwa intentionally removed: the app-shell service worker was
// serving stale landing-page HTML. public/sw.js is now a kill-switch worker
// that evicts the old registration on first visit. push-sw.js (web push) is
// unrelated and kept as-is.
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    // Never let a proxy/CDN or browser hold onto the app shell — stale HTML was
    // serving an outdated landing page in preview.
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  },

  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      (process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.includes("bwvocmhcledbwqlpcswp"))
        ? process.env.VITE_SUPABASE_URL
        : (process.env.SUPABASE_PROJECT_URL || "https://jrsydiofzceoeddjogov.supabase.co")
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      (process.env.VITE_SUPABASE_PROJECT_ID && process.env.VITE_SUPABASE_PROJECT_ID !== "bwvocmhcledbwqlpcswp")
        ? process.env.VITE_SUPABASE_PROJECT_ID
        : "jrsydiofzceoeddjogov"
    ),
    "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(
      process.env.VITE_GOOGLE_CLIENT_ID || process.env.GCP_CLIENT_ID || "713824918751-ng4ag1lmfv3mupep1ca32rmjm6r72elf.apps.googleusercontent.com"
    ),
    "import.meta.env.VITE_GCP_CLIENT_ID": JSON.stringify(
      process.env.GCP_CLIENT_ID || "713824918751-ng4ag1lmfv3mupep1ca32rmjm6r72elf.apps.googleusercontent.com"
    ),
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
    visualizer({
      filename: "dist/stats.html",
      title: "RentMaikar Bundle Analysis & Dependency Report",
      gzipSize: true,
      brotliSize: true,
      open: false,
      template: "treemap",
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: (chunkInfo) => {
          const sanitized = chunkInfo.name.replace(/error/gi, "handler");
          return `assets/${sanitized}-[hash].js`;
        },
      },
    },
  },
}));
