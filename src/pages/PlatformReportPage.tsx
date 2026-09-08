import { useState } from "react";
import { jsPDF } from "jspdf";
import { Download, Printer, CheckCircle2, Layers, Cpu, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export interface FeaturePillar {
  title: string;
  count: string;
  color: string;
  features: { name: string; desc: string }[];
}

export const FEATURE_PILLARS: FeaturePillar[] = [
  {
    title: "1. Public Marketplace & Vehicle Discovery",
    count: "10 Features",
    color: "bg-blue-500",
    features: [
      { name: "Curated Vehicle Catalogue", desc: "Three-tier segmented fleet browsing (Budget, Standard, and Premium cars) with responsive cards." },
      { name: "Dynamic Rental Calculator", desc: "Real-time daily, weekly, and deposit rate calculation per vehicle category." },
      { name: "Region & Currency Switcher", desc: "Multi-region support with dynamic regional pricing and local localization." },
      { name: "Interactive Product Tour", desc: "Multi-step interactive onboarding walkthrough for new prospective drivers and owners." },
      { name: "How It Works Flow", desc: "Guided step-by-step visual workflows for both prospective drivers and car owners." },
      { name: "FAQ & Help Center", desc: "Searchable knowledge base covering security deposits, insurance, repairs, and platform policies." },
      { name: "Direct WhatsApp & SMS Integration", desc: "Pre-filled customer communication links for rapid conversion and inquiries." },
      { name: "Responsive Vehicle Filtering", desc: "Multi-parameter search by transmission (Auto/Manual), fuel type, model year, and seat count." },
      { name: "Vehicle Detail Showcases", desc: "High-resolution galleries, vehicle specs, inspection status, and booking terms." },
      { name: "Legal & Compliance Pages", desc: "Public terms of service, privacy policy, and driver agreements." },
    ],
  },
  {
    title: "2. Identity, Onboarding & Compliance (KYC/AML)",
    count: "8 Features",
    color: "bg-emerald-500",
    features: [
      { name: "Multi-Role Authentication", desc: "Unified authentication supporting Drivers, Owners, Admins, and Support staff." },
      { name: "Google OAuth 2.0 Single Sign-On", desc: "One-click authentication via Google Identity Services and Supabase Auth." },
      { name: "Magic Link & Email Verification", desc: "Passwordless authentication and transactional verification workflows." },
      { name: "Automated Driver KYC", desc: "Persona inquiry integration with Nigerian Driver's License and NIN validation." },
      { name: "Referee Attestation Portal", desc: "Automated SMS/email dispatch allowing guarantors to attest for drivers online." },
      { name: "Criminal & Background Checks", desc: "Automated police clearance and driving violation audit tracking." },
      { name: "Vehicle Owner Onboarding", desc: "Multi-step wizard collecting registration documents, proof of ownership, and insurance." },
      { name: "Proxy Consent Management", desc: "Digital signature collection for background checks and location tracking." },
    ],
  },
  {
    title: "3. Driver Operating Suite",
    count: "9 Features",
    color: "bg-amber-500",
    features: [
      { name: "Driver Command Dashboard", desc: "Active rental status, daily countdowns, and upcoming payment reminders." },
      { name: "Instant Vehicle Reservation", desc: "Direct booking requests with automated deposit calculations." },
      { name: "Driver Training Academy", desc: "Video tutorials, road safety quizzes, and completion certification." },
      { name: "Weekly Vehicle Inspections", desc: "Mandatory photo-based damage and odometer upload with comparison to check-in logs." },
      { name: "Driver Wallet & Billing History", desc: "Transparent ledger of completed payments, deposit balances, and invoices." },
      { name: "In-App Messaging & Notifications", desc: "Real-time direct alerts for payment due dates and maintenance notices." },
      { name: "Incident & Accident Reporting", desc: "Guided collision reporting with location tagging and photo uploads." },
      { name: "Emergency SOS Trigger", desc: "One-tap rapid assistance dispatch for breakdowns or security incidents." },
      { name: "Profile & Documents Vault", desc: "Secure portal to renew expired licenses and insurance documents." },
    ],
  },
  {
    title: "4. Vehicle Owner & Fleet Management",
    count: "9 Features",
    color: "bg-indigo-500",
    features: [
      { name: "Owner Fleet Dashboard", desc: "High-level earnings, fleet utilization rates, and active vehicle statuses." },
      { name: "Vehicle Listing & Registration", desc: "Vehicle upload wizard with VIN decoding, specs, and custom pricing rules." },
      { name: "Real-time Live GPS Tracking", desc: "Interactive map rendering vehicle locations with speed and ignition status." },
      { name: "Remote Engine Immobilization", desc: "Instant remote engine cut-off command for security breaches or defaults." },
      { name: "Earnings & Payout Engine", desc: "Automated calculation of net payouts after platform commissions." },
      { name: "Withdrawal Request Center", desc: "Direct bank transfer requests with multi-stage approval workflows." },
      { name: "Maintenance & Service Scheduler", desc: "Oil change, brake pad, and tire service mileage alerts and expense logging." },
      { name: "Inspection Approval Review", desc: "Review and approve driver-submitted weekly condition photos." },
      { name: "Rental Agreement Archive", desc: "Legally binding digital contracts generated for each active driver placement." },
    ],
  },
  {
    title: "5. IoT Telemetry & Hardware Operations",
    count: "7 Features",
    color: "bg-cyan-500",
    features: [
      { name: "Traccar GPS Integration", desc: "Automated ingestion of vehicle GPS coordinates, heading, and battery levels." },
      { name: "Hologram Cellular SIM Diagnostics", desc: "Cellular data usage, connectivity health, and device status monitoring." },
      { name: "Proximity Matching Algorithm", desc: "Mathematical geo-proximity calculation pairing drivers with nearby vehicles." },
      { name: "Geofencing & Boundary Alerts", desc: "Virtual perimeter definition with instant notifications on boundary violations." },
      { name: "Hardware Provisioning Queue", desc: "Pre-deployment testing flow for new GPS trackers and OBD-II units." },
      { name: "Traccar Command Console", desc: "Direct manual dispatch of hardware commands (status queries, remote reboot)." },
      { name: "Device Health Dashboard", desc: "Battery degradation and signal strength alert system across the fleet." },
    ],
  },
  {
    title: "6. Support & Specialist Portals",
    count: "6 Features",
    color: "bg-violet-500",
    features: [
      { name: "Legal Support Portal (/support/legal)", desc: "Contract review, legal escalation tracking, and regulatory filing logs." },
      { name: "IoT Hardware Portal (/support/iot)", desc: "SIM card troubleshooting, device assignment, and telemetry anomaly logs." },
      { name: "Vehicle Support Portal (/support/vehicle)", desc: "Mechanical claim handling, roadside assistance dispatch, and repair estimates." },
      { name: "Insurance Support Portal (/support/insurance)", desc: "Accident claims processing, third-party liability records, and payouts." },
      { name: "Unified Support Ticket Queue", desc: "Cross-departmental task assignment and SLA response time tracking." },
      { name: "Support Role Impersonation", desc: "Secure session impersonation to troubleshoot issues from the user's perspective." },
    ],
  },
  {
    title: "7. Treasury, Payments & Financial Reconciliation",
    count: "10 Features",
    color: "bg-rose-500",
    features: [
      { name: "Multi-PSP Payment Gateways", desc: "Native integration with PayPal (Global/US), OPay (Nigeria Cashier), Paystack, Flutterwave, and Stripe." },
      { name: "Settlement Reconciliation Engine", desc: "Automated comparison of bank settlement reports against system invoices." },
      { name: "Automated Rental Escrow", desc: "Segregated deposit holding and conditional refund authorization." },
      { name: "Billing Reconciliation", desc: "Audit of expected driver billing cycles against captured payments." },
      { name: "Ledger Discrepancy Detector", desc: "Double-entry ledger audit identifying underpayments, overpayments, or duplicates." },
      { name: "Invoice Status Tracking", desc: "Status tracking across Pending, Paid, Failed, Overdue, and Waived states." },
      { name: "Owner Withdrawal Payout Queue", desc: "Batch review and disbursement approvals for owner earnings." },
      { name: "Payment Dispute Arbitrator", desc: "Evidence collection and dispute management for chargebacks." },
      { name: "Payment Credential Health Monitor", desc: "Real-time webhook and API key status checks for payment providers." },
      { name: "Financial Data Export & Audit", desc: "CSV and PDF export generator for external accounting." },
    ],
  },
  {
    title: "8. Administrative Command Center & Platform Tools",
    count: "12 Features",
    color: "bg-slate-700",
    features: [
      { name: "Executive KPI Dashboard", desc: "Platform-wide revenue, fleet occupancy, and active driver metrics." },
      { name: "Live Secrets & API Key Vault", desc: "Centralized environment variable, GCP credential, and API key management." },
      { name: "Omnichannel Message Reader & Reply Console", desc: "Consolidated reader, drafting and replying console for incoming customer emails, SMS, and WhatsApp messages." },
      { name: "AI Auto-Responder & Legal Grounding", desc: "Automated keyword detection matching responses to Terms of Use, Legal policies, and FAQ archives with one-click approval." },
      { name: "Admin TODO List Auto-Sync", desc: "Queues AI draft responses directly to the Daily Task List for administrative approval and tracking." },
      { name: "Standardized Saved Responses Library", desc: "Custom template archive allowing administrators to quickly insert, create, and reuse approved replies." },
      { name: "Workflow Tagging & Status Labeling", desc: "Urgent, In Progress, and Resolved tags with color-coded badges and instant status updates." },
      { name: "Multi-Parameter Message Filter & Search", desc: "High-speed text search across sender names, contact details (email/phone), topics, and message content." },
      { name: "Visual Read/Unread & Timestamps", desc: "Real-time indicators and delivery timestamps for instant triage of incoming customer inquiries." },
      { name: "Vehicle Approval & Ingestion Queue", desc: "Review pipeline for new vehicles submitted by owners." },
      { name: "VoIP & CPaaS Call Center", desc: "Browser-based calling, SMS dispatch, and call log tracking." },
      { name: "Comprehensive System Audit Log", desc: "Immutable record of all administrative actions, logins, and status overrides." },
    ],
  },
];

export default function PlatformReportPage() {
  const [downloading, setDownloading] = useState(false);

  const generateAndDownloadPdf = () => {
    setDownloading(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > pageHeight - 20) {
          doc.addPage();
          y = margin;
          renderHeaderBar();
        }
      };

      const renderHeaderBar = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(margin, 10, contentWidth, 0.8, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("RentMaikar - Official Platform Feature & Architecture Catalog", margin, 9);
        doc.text("Enterprise Operations Specification", pageWidth - margin, 9, { align: "right" });
        y = 18;
      };

      // First page header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 32, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text("RentMaikar Operations Platform", margin, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Comprehensive Feature Catalog & Architectural Specification", margin, 24);

      const dateStr = "September 2026 | Production Build";
      doc.text(dateStr, pageWidth - margin, 24, { align: "right" });

      y = 42;

      // Summary Card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "FD");

      const metrics = [
        { label: "Total Features", value: "68 Modules" },
        { label: "App Routes", value: "71 Routes" },
        { label: "Page Views", value: "96 Pages" },
        { label: "Components", value: "436 Elements" },
        { label: "RBAC Roles", value: "8 Roles" },
      ];

      const colWidth = contentWidth / metrics.length;
      metrics.forEach((m, idx) => {
        const colX = margin + idx * colWidth + colWidth / 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(m.value, colX, y + 9, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(m.label, colX, y + 16, { align: "center" });
      });

      y += 30;

      FEATURE_PILLARS.forEach((sec) => {
        checkPageBreak(18 + sec.features.length * 10);

        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, contentWidth, 7.5, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text(sec.title, margin + 2.5, y + 5.2);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(sec.count, pageWidth - margin - 3, y + 5.2, { align: "right" });

        y += 10.5;

        sec.features.forEach((feat) => {
          checkPageBreak(11);

          doc.setFillColor(37, 99, 235);
          doc.circle(margin + 2.5, y + 2.5, 1, "F");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.8);
          doc.setTextColor(15, 23, 42);
          doc.text(feat.name, margin + 6, y + 3.2);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          const splitDesc = doc.splitTextToSize(feat.desc, contentWidth - 8);
          doc.text(splitDesc, margin + 6, y + 7.2);

          y += 9.5;
        });

        y += 3;
      });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `RentMaikar Platform Report | rentmaikar.com | Page ${i} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      }

      doc.save("rentmaikar-platform-features-report.pdf");
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-24 max-w-5xl">
        {/* Top Navigation */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
          <Link to="/admin?portal=docs&tab=platform-features" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Admin Docs Portal
          </Link>

          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.print()}
              className="gap-2 text-slate-700 hover:bg-slate-100"
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button 
              size="sm" 
              onClick={generateAndDownloadPdf}
              disabled={downloading}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              <Download className="w-4 h-4" />
              {downloading ? "Generating PDF..." : "Download PDF Report"}
            </Button>
          </div>
        </div>

        {/* Hero Title Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-8 mb-8 shadow-md relative overflow-hidden">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <ShieldCheck className="w-4 h-4" />
            Confidential - Internal Admin Documentation
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            RentMaikar Operations Platform
          </h1>
          <p className="text-slate-300 text-base max-w-3xl">
            Internal architectural catalog detailing all 68 active core features, operational modules, and multi-role permission boundaries governing the RentMaikar vehicle rental and IoT fleet ecosystem.
          </p>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-900">68</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Core Modules</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-900">71</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Active Routes</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-900">96</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Page Views</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-900">436</div>
            <div className="text-xs text-slate-500 font-medium mt-1">UI Components</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center col-span-2 sm:col-span-1">
            <div className="text-2xl font-bold text-blue-600">8</div>
            <div className="text-xs text-slate-500 font-medium mt-1">RBAC Roles</div>
          </div>
        </div>

        {/* Features by Pillar */}
        <div className="space-y-8">
          {FEATURE_PILLARS.map((pillar, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-100/80 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${pillar.color}`} />
                  <h2 className="font-semibold text-slate-900 text-base">{pillar.title}</h2>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-white border border-slate-200 rounded-full text-slate-600">
                  {pillar.count}
                </span>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {pillar.features.map((feat, fIdx) => (
                  <div key={fIdx} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight">{feat.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA Banner */}
        <div className="mt-12 p-8 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-blue-900">Need an offline copy?</h3>
            <p className="text-sm text-blue-700">Click below to generate and save this entire report as an A4 formatted PDF.</p>
          </div>
          <Button 
            onClick={generateAndDownloadPdf}
            disabled={downloading}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-6 py-2.5 shadow-sm whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            {downloading ? "Preparing Document..." : "Download Complete PDF"}
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
}
