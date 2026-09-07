import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    clearMocks: true,
    restoreMocks: true,
    // Vitest owns the jsdom/unit suite only. Playwright specs (tests/e2e) and
    // Deno tests (supabase/**) have their own runners in CI and fail here with
    // "0 test" when collected by mistake.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/e2e/**",
      "supabase/**",
      "backend/**",
    ],
  },
});
