import React from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ShieldCheck, FileText, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

export const DriverAgreementPage: React.FC = () => {
  const LEGAL_VERSION = "2026-10-01-v2";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full space-y-8">
        <div className="border-b border-border/80 pb-6 space-y-2">
          <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider">
            <FileText className="h-4 w-4" /> Operational Legal Document
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Master Driver Rental &amp; Operations Agreement</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Document Version: <span className="font-bold text-foreground">{LEGAL_VERSION}</span> • Effective: October 1, 2026
          </p>
        </div>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">1. Driver Eligibility, Screening &amp; Background Verification</h2>
            <p>
              To maintain an active driver account on the Rentmaikar platform, drivers must satisfy and continuously maintain:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Comprehensive criminal history check and multi-state sex offender registry clearance.</li>
              <li>Motor Vehicle Record (MVR) screening verifying an active, non-suspended driver's license with zero major disqualifying violations within 36 months.</li>
              <li>Verified active rideshare platform accreditation (Uber, Lyft, Bolt, or regional partner).</li>
              <li>Completion and verified passing status across all mandatory Rentmaikar Driver Training Academy modules, refreshed semiannually.</li>
              <li>Satisfactory confidential referee attestations prior to vehicle key assignment.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">2. Vehicle Custody, IoT Telemetry &amp; Geo-Boundary Covenants</h2>
            <p>
              Vehicles leased through Rentmaikar are equipped with cellular IoT telemetry units (Traccar / EMQX / Hologram / Sarekon) monitoring vehicle health, mileage, operating state, and tamper events. The driver covenants:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>To operate the vehicle strictly within authorized operational jurisdictions (Washington DC, Maryland, Virginia, or designated Nigerian operating zones).</li>
              <li>Never to tamper with, disconnect, block, or subvert the onboard GPS/telemetry hardware.</li>
              <li>To immediately report any critical fault code, warning light, or mechanical failure via the Mobile Call-In portal.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">3. Payment, Security Deposit &amp; Proxy Billing Authorizations</h2>
            <p>
              Rental disbursements, weekly lease fees, and toll reconciliations must be satisfied via active automated payment methods. Where a third-party guarantor or sponsor authorizes charges, proxy consent must be executed with digital signature and verified identity under the Rentmaikar Proxy Consent Framework.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">4. Mandatory Incident &amp; Accident Reporting Protocol</h2>
            <p>
              In any accident, collision, vandalism, or theft incident:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>The driver must submit photographic proof through the Incident Reporting module within sixty (60) minutes of occurrence.</li>
              <li>All photographic evidence is stored securely in private encrypted vaults with cryptographic SHA-256 validation.</li>
              <li>In personal safety emergencies, drivers must utilize the authenticated One-Tap Emergency SOS Trigger or call emergency dispatch directly.</li>
            </ul>
          </section>
        </div>

        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs font-medium">
          <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/legal/proxy-consent" className="text-primary hover:underline">Proxy Consent Framework</Link>
          <Link to="/legal/data-rights" className="text-primary hover:underline">Data Rights</Link>
          <Link to="/legal/cookies" className="text-primary hover:underline">Cookie Policy</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DriverAgreementPage;
