import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";

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

function checkPageBreak(neededHeight) {
  if (y + neededHeight > pageHeight - 20) {
    doc.addPage();
    y = margin;
    renderHeaderBar(false);
  }
}

function renderHeaderBar(isFirstPage) {
  if (!isFirstPage) {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(margin, 10, contentWidth, 0.8, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("RentMaikar - Official Platform Feature & Architecture Catalog", margin, 9);
    doc.text("CONFIDENTIAL / INTERNAL ADMIN USE ONLY", pageWidth - margin, 9, { align: "right" });
    y = 18;
  }
}

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

const dateStr = "September 2026 | Version 2.4-Production";
doc.text(dateStr, pageWidth - margin, 24, { align: "right" });

y = 42;

// Overview Card / Metric Banner
doc.setFillColor(248, 250, 252);
doc.setDrawColor(226, 232, 240);
doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "FD");

const metrics = [
  { label: "Total Core Features", value: "68 Modules" },
  { label: "Active App Routes", value: "71 Routes" },
  { label: "Page Controllers", value: "96 Pages" },
  { label: "Modular Components", value: "436 UI Elements" },
  { label: "Specialized Roles", value: "8 RBAC Roles" },
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

const sections = [
  {
    title: "1. Public Marketplace & Vehicle Discovery",
    count: "10 Features",
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
    count: "9 Features",
    features: [
      { name: "Executive KPI Dashboard", desc: "Platform-wide revenue, fleet occupancy, and active driver metrics." },
      { name: "Live Secrets & API Key Vault", desc: "Centralized environment variable, GCP credential, and API key management." },
      { name: "Vehicle Approval & Ingestion Queue", desc: "Review pipeline for new vehicles submitted by owners." },
      { name: "Bulk Vehicle Import", desc: "CSV/spreadsheet parser for fleet owners importing multiple cars at once." },
      { name: "Unified Operations Inbox", desc: "Consolidated omnichannel messaging interface for customer support." },
      { name: "VoIP & CPaaS Call Center", desc: "Browser-based calling, SMS dispatch, and call log tracking." },
      { name: "Email & SMS Delivery Logs", desc: "Delivery rates, bounce tracking, and consent audit logs (TCPA/NDPR compliant)." },
      { name: "Interactive Tour Analytics", desc: "Funnel tracking of users engaging with the introductory tour." },
      { name: "Comprehensive System Audit Log", desc: "Immutable record of all administrative actions, logins, and status overrides." },
    ],
  },
];

sections.forEach((sec) => {
  checkPageBreak(18 + sec.features.length * 10);

  // Section Header Bar
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

  sec.features.forEach((feat, idx) => {
    checkPageBreak(11);

    // Bullet point
    doc.setFillColor(37, 99, 235);
    doc.circle(margin + 2.5, y + 2.5, 1, "F");

    // Feature Name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(feat.name, margin + 6, y + 3.2);

    // Feature Description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const splitDesc = doc.splitTextToSize(feat.desc, contentWidth - 8);
    doc.text(splitDesc, margin + 6, y + 7.2);

    y += 9.5;
  });

  y += 3;
});

// Footer with page numbering on all pages
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

const outDir = path.resolve(process.cwd(), "public/downloads");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outFile = path.join(outDir, "rentmaikar-platform-features-report.pdf");
const pdfData = doc.output();
fs.writeFileSync(outFile, pdfData, "binary");

console.log(`PDF successfully generated: ${outFile} (${(pdfData.length / 1024).toFixed(1)} KB)`);
