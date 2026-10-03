import React from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ShieldCheck, CreditCard, Lock } from "lucide-react";
import { Link } from "react-router-dom";

export const ProxyConsentTermsPage: React.FC = () => {
  const LEGAL_VERSION = "2026-10-01-v2";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full space-y-8">
        <div className="border-b border-border/80 pb-6 space-y-2">
          <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider">
            <Lock className="h-4 w-4" /> Compliance &amp; Billing Policy
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Third-Party Proxy Billing &amp; Guarantor Consent Terms</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Document Version: <span className="font-bold text-foreground">{LEGAL_VERSION}</span> • Effective: October 1, 2026
          </p>
        </div>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">1. Proxy Billing Mandate</h2>
            <p>
              Under Rentmaikar's Proxy Billing Framework, an individual other than the registered driver ("Cardholder" or "Proxy Sponsor") may authoritatively authorize their debit/credit card or payment method to be charged for weekly vehicle rentals, recurring subscription fees, toll reconciliations, or incident deductibles.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">2. Compulsory Identity Verification Before Tokenization</h2>
            <p>
              In accordance with AML/KYC guidelines and payment network anti-fraud standards, no payment method will be tokenized, vaulted, or debited until:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>The Cardholder completes government-issued photo identity verification (via Persona or approved regional document validation).</li>
              <li>The Cardholder executes a digital signature linked to their verified legal name and IP address.</li>
              <li>The unique invitation token is validated prior to the 14-day expiry window.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">3. Tokenization &amp; Zero-Storage Pan Discipline</h2>
            <p>
              Rentmaikar strictly operates under PCI-DSS Level 1 compliant vaulting protocols. Full primary account numbers (PAN), CVVs, and magnetic stripe data are never stored, logged, or processed in cleartext on Rentmaikar infrastructure. Only masked token references, fingerprints, and last-4 digits are retained.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">4. Revocation of Authorization</h2>
            <p>
              A Cardholder may revoke their proxy authorization at any time by accessing the Cancel Authorization link transmitted in all billing notifications or by submitting a ticket to support.
            </p>
          </section>
        </div>

        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs font-medium">
          <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/legal/driver-agreement" className="text-primary hover:underline">Driver Agreement</Link>
          <Link to="/legal/data-rights" className="text-primary hover:underline">Data Rights</Link>
          <Link to="/legal/cookies" className="text-primary hover:underline">Cookie Policy</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProxyConsentTermsPage;
