import React from "react";
import { createRoot } from "react-dom/client";

import { HelmetProvider } from "react-helmet-async";

import App from "./App.tsx";
import "./index.css";

import { initErrorMonitoring } from "./lib/error-monitor";
import { registerPWA } from "./pwa/register";

import "./services";
import "./plugins";

import ErrorBoundary from "./components/errors/ErrorBoundary";
import { hardReload, isStaleBundleError } from "./lib/bundle-recovery";

// Vite fires this when a lazy chunk referenced by a stale HTML shell 404s.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (!sessionStorage.getItem("rmk_bundle_recovery")) {
    sessionStorage.setItem("rmk_bundle_recovery", "1");
    void hardReload();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (isStaleBundleError(event.reason) && !sessionStorage.getItem("rmk_bundle_recovery")) {
    sessionStorage.setItem("rmk_bundle_recovery", "1");
    void hardReload();
  }
});



// Initialize monitoring before React starts
initErrorMonitoring();


const root =
document.getElementById("root");


if (!root) {
  throw new Error(
    "Root element not found"
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>

    <ErrorBoundary>

      <HelmetProvider>

        <App />

      </HelmetProvider>

    </ErrorBoundary>

  </React.StrictMode>
);

// Register service worker
registerPWA();
