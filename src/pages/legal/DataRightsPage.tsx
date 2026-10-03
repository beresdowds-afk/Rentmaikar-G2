import React from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ShieldCheck, UserCheck, Download } from "lucide-react";
import { Link } from "react-router-dom";

export const DataRightsPage: React.FC = () => {
  const LEGAL_VERSION = "2026-10-01-v2";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full space-y-8">
        <div className="border-b border-border/80 pb-6 space-y-2">
          <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider">
            <UserCheck className="h-4 w-4" /> Global Privacy &amp; Data Rights
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Data Subject Rights &amp; Regulatory Disclosures</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Document Version: <span className="font-bold text-foreground">{LEGAL_VERSION}</span> • CCPA, GDPR &amp; NDPR Compliant
          </p>
        </div>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">1. User Rights Across Jurisdictions</h2>
            <p>
              Whether accessing Rentmaikar in the United States (under CCPA/CPRA, Virginia VCDPA) or Nigeria (under NDPR / Nigeria Data Protection Act 2023), registered drivers, owners, and guarantors possess the statutory rights to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Request access to all telemetry, identity records, and financial transaction histories.</li>
              <li>Request correction of inaccurate personal data.</li>
              <li>Request erasure of personal records, subject to regulatory financial auditing and insurance statute of limitations (typically 7 years).</li>
              <li>Opt-out of any third-party marketing or cross-context behavioral advertising.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">2. Exercising Your Rights</h2>
            <p>
              To initiate a formal Data Subject Access Request (DSAR) or request account record purge, email <a href="mailto:privacy@rentmaikar.com" className="text-primary font-mono">privacy@rentmaikar.com</a> or open an authenticated support ticket under the "Legal &amp; Privacy" queue.
            </p>
          </section>
        </div>

        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs font-medium">
          <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/legal/driver-agreement" className="text-primary hover:underline">Driver Agreement</Link>
          <Link to="/legal/proxy-consent" className="text-primary hover:underline">Proxy Consent</Link>
          <Link to="/legal/cookies" className="text-primary hover:underline">Cookie Policy</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DataRightsPage;
