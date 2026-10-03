import React from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Cookie, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export const CookiePolicyPage: React.FC = () => {
  const LEGAL_VERSION = "2026-10-01-v2";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full space-y-8">
        <div className="border-b border-border/80 pb-6 space-y-2">
          <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider">
            <Cookie className="h-4 w-4" /> Tracking &amp; Storage Transparency
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Cookie &amp; Local Storage Policy</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Document Version: <span className="font-bold text-foreground">{LEGAL_VERSION}</span> • Effective: October 1, 2026
          </p>
        </div>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">1. Technologies We Use</h2>
            <p>
              Rentmaikar employs cookies, browser local storage, session storage, and Progressive Web App (PWA) service workers to authenticate users, maintain security tokens, ensure offline telemetry resilience, and remember regional currency preferences (USD vs. NGN).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">2. Classification of Cookies</h2>
            <div className="space-y-2">
              <p><strong>Strictly Necessary:</strong> Essential for cryptographic session authentication, multi-factor OTP validation, and secure payment checkout.</p>
              <p><strong>Functional &amp; Regional:</strong> Retains regional catalogue filters (USA vs Nigeria), notification preferences, and portal theme settings.</p>
              <p><strong>Telemetry &amp; Reliability:</strong> Used for diagnostic health checking and offline queue synchronization when mobile network connectivity fluctuates.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">3. Managing Preferences</h2>
            <p>
              You can adjust your browser cookie settings at any time or clear local storage. Disabling strictly necessary cookies may prevent secure authentication to the driver or owner portals.
            </p>
          </section>
        </div>

        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs font-medium">
          <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/legal/driver-agreement" className="text-primary hover:underline">Driver Agreement</Link>
          <Link to="/legal/proxy-consent" className="text-primary hover:underline">Proxy Consent</Link>
          <Link to="/legal/data-rights" className="text-primary hover:underline">Data Rights</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CookiePolicyPage;
