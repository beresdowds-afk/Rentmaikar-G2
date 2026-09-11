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
const margin = 14;
const contentWidth = pageWidth - margin * 2;
let y = margin;

function renderHeaderBar(isFirstPage) {
  if (!isFirstPage) {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(margin, 10, contentWidth, 0.6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("RentMaikar - Database Schema Reconciliation Report (Source vs Destination)", margin, 8.5);
    doc.text("READ-ONLY AUDIT | CONFIDENTIAL", pageWidth - margin, 8.5, { align: "right" });
    y = 16;
  }
}

function checkPageBreak(neededHeight) {
  if (y + neededHeight > pageHeight - 16) {
    doc.addPage();
    y = margin;
    renderHeaderBar(false);
  }
}

// -------------------------------------------------------------
// COVER / FIRST PAGE HEADER
// -------------------------------------------------------------
doc.setFillColor(15, 23, 42); // slate-900
doc.rect(0, 0, pageWidth, 36, "F");

doc.setFont("helvetica", "bold");
doc.setFontSize(16);
doc.setTextColor(255, 255, 255);
doc.text("DATABASE SCHEMA RECONCILIATION REPORT", margin, 14);

doc.setFont("helvetica", "normal");
doc.setFontSize(8.5);
doc.setTextColor(148, 163, 184);
doc.text("Comprehensive Comparative Column-Level Audit | Source vs Destination", margin, 21);

doc.setFont("helvetica", "normal");
doc.setFontSize(7.5);
doc.setTextColor(203, 213, 225);
doc.text("Authoritative Source: bwvocmhcledbwqlpcswp | Target: jrsydiofzceoeddjogov (PostgreSQL 17.6)", margin, 27);
doc.text("Audit Date: September 2026 | Mode: Strict Read-Only", pageWidth - margin, 27, { align: "right" });

y = 42;

// -------------------------------------------------------------
// EXECUTIVE METRICS STRIP
// -------------------------------------------------------------
doc.setFillColor(248, 250, 252);
doc.setDrawColor(226, 232, 240);
doc.roundedRect(margin, y, contentWidth, 20, 2, 2, "FD");

const summaryMetrics = [
  { label: "Authoritative Source", val: "Lovable Supabase" },
  { label: "Target Database", val: "Dedicated Supabase" },
  { label: "Audit Mode", val: "Strict Read-Only" },
  { label: "Impacted Tables", val: "15 Tables" },
  { label: "Missing Columns", val: "99 Columns" },
  { label: "Executions Run", val: "0 DDL Executed" },
];

const metricColW = contentWidth / summaryMetrics.length;
summaryMetrics.forEach((m, idx) => {
  const cx = margin + idx * metricColW + metricColW / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(m.val, cx, y + 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(m.label, cx, y + 14, { align: "center" });
});

y += 26;

// -------------------------------------------------------------
// AUDIT CONSTRAINTS & CRITERIA BANNER
// -------------------------------------------------------------
doc.setFillColor(241, 245, 249);
doc.setDrawColor(203, 213, 225);
doc.roundedRect(margin, y, contentWidth, 14, 1.5, 1.5, "FD");

doc.setFont("helvetica", "bold");
doc.setFontSize(8);
doc.setTextColor(30, 41, 59);
doc.text("Audit Scope & Verification Standard", margin + 4, y + 5);

doc.setFont("helvetica", "normal");
doc.setFontSize(7);
doc.setTextColor(71, 85, 105);
const criteriaText = "Every missing column evaluated across 12 criteria: Table, Column Name, Source Data Type, Destination Type (Missing), Source Nullability, Destination Nullability, Source Default, Destination Default, Constraints/Indexes/FKs, Migration Requirement, App Impact, and DDL Recommendation.";
doc.text(doc.splitTextToSize(criteriaText, contentWidth - 8), margin + 4, y + 9.5);

y += 20;

// -------------------------------------------------------------
// DATA MODEL AUDIT DATA
// -------------------------------------------------------------
const tableAudits = [
  {
    table: "1. applications",
    missingCount: "22 Missing Columns",
    note: "Contains applicant consent flags, recycling lineage, and guarantor/referee contact fields verified by validate_application_submission()",
    columns: [
      { name: "street_address", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (applicant address)", impact: "Safe nullable text", rec: "ADD" },
      { name: "messaging_consent", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (communication compliance)", impact: "Safe default false", rec: "ADD" },
      { name: "messaging_channel", type: "text", nullability: "NOT NULL", def: "'none'", fks: "None", req: "Yes (SMS/WhatsApp channel)", impact: "Safe default 'none'", rec: "ADD" },
      { name: "data_sharing_consent", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (vetting consent)", impact: "Safe default false", rec: "ADD" },
      { name: "consent_recorded_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (consent timestamp)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "recovered_from_application_id", type: "uuid", nullability: "Nullable", def: "None", fks: "FK applications(id) ON DELETE SET NULL", req: "Yes (lineage for recycled records)", impact: "Self-referential FK", rec: "ADD" },
      { name: "recovery_status", type: "text", nullability: "NOT NULL", def: "'none'", fks: "None", req: "Yes (lifecycle state)", impact: "Safe default 'none'", rec: "ADD" },
      { name: "recovery_eligible_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (cooldown timer)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "recycle_count", type: "integer", nullability: "NOT NULL", def: "0", fks: "None", req: "Yes (recycling iteration)", impact: "Safe default 0", rec: "ADD" },
      { name: "security_deposit_acknowledged", type: "boolean", nullability: "Nullable", def: "false", fks: "None", req: "Yes (deposit agreement)", impact: "Used in review pipeline", rec: "ADD" },
      { name: "referee1_name", type: "text", nullability: "Nullable", def: "None", fks: "Validated in validate_application_submission()", req: "Yes (referee 1 profile)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee1_phone", type: "text", nullability: "Nullable", def: "None", fks: "Phone len <= 32", req: "Yes (referee 1 contact)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee1_email", type: "text", nullability: "Nullable", def: "None", fks: "Email validation", req: "Yes (referee 1 email)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee1_address", type: "text", nullability: "Nullable", def: "None", fks: "Address len <= 300", req: "Yes (referee 1 address)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee2_name", type: "text", nullability: "Nullable", def: "None", fks: "Validated in validate_application_submission()", req: "Yes (referee 2 profile)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee2_phone", type: "text", nullability: "Nullable", def: "None", fks: "Phone len <= 32", req: "Yes (referee 2 contact)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee2_email", type: "text", nullability: "Nullable", def: "None", fks: "Email validation", req: "Yes (referee 2 email)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee2_address", type: "text", nullability: "Nullable", def: "None", fks: "Address len <= 300", req: "Yes (referee 2 address)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee3_name", type: "text", nullability: "Nullable", def: "None", fks: "Validated in validate_application_submission()", req: "Yes (referee 3 profile)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee3_phone", type: "text", nullability: "Nullable", def: "None", fks: "Phone len <= 32", req: "Yes (referee 3 contact)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee3_email", type: "text", nullability: "Nullable", def: "None", fks: "Email validation", req: "Yes (referee 3 email)", impact: "Fixes trigger compatibility", rec: "ADD" },
      { name: "referee3_address", type: "text", nullability: "Nullable", def: "None", fks: "Address len <= 300", req: "Yes (referee 3 address)", impact: "Fixes trigger compatibility", rec: "ADD" }
    ]
  },
  {
    table: "2. communication_providers",
    missingCount: "1 Missing Column",
    note: "Identifies WhatsApp Business Solution Provider (Twilio / Infobip / Meta)",
    columns: [
      { name: "whatsapp_provider", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (provider selection)", impact: "Safe nullable text", rec: "ADD" }
    ]
  },
  {
    table: "3. driver_call_ins",
    missingCount: "5 Missing Columns",
    note: "Maintenance fault call-in renewals & vehicle recall linkage (Migration 20260910103000)",
    columns: [
      { name: "renewal_count", type: "integer", nullability: "NOT NULL", def: "0", fks: "None", req: "Yes (deferral counter)", impact: "Safe default 0", rec: "ADD" },
      { name: "max_renewals", type: "integer", nullability: "NOT NULL", def: "3", fks: "None", req: "Yes (deferral limit)", impact: "Safe default 3", rec: "ADD" },
      { name: "last_renewed_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (extension timestamp)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "recall_initiated", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (recall escalation flag)", impact: "Safe default false", rec: "ADD" },
      { name: "recall_id", type: "uuid", nullability: "Nullable", def: "None", fks: "FK vehicle_recalls(id)", req: "Yes (recall linkage)", impact: "Safe nullable FK", rec: "ADD" }
    ]
  },
  {
    table: "4. driver_vehicle_matches",
    missingCount: "1 Missing Column",
    note: "Referee-gated vehicle provisioning gate (Migration 20260910113000)",
    columns: [
      { name: "vehicle_enabled", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (IoT ignition enable switch)", impact: "Safe default false", rec: "ADD" }
    ]
  },
  {
    table: "5. inbox_conversations",
    missingCount: "2 Missing Columns",
    note: "In-app messaging archival status and conversation flagging flags",
    columns: [
      { name: "archived_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (archival state)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "is_flagged", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (escalation indicator)", impact: "Safe default false", rec: "ADD" }
    ]
  },
  {
    table: "6. outreach_contacts",
    missingCount: "2 Missing Columns",
    note: "Marketing and outbound driver onboarding recruitment channels",
    columns: [
      { name: "email", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (prospect email)", impact: "Safe nullable text", rec: "ADD" },
      { name: "signup_role", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (prospect role)", impact: "Safe nullable text", rec: "ADD" }
    ]
  },
  {
    table: "7. payments",
    missingCount: "6 Missing Columns",
    note: "Financial distribution: Host payout share, platform commissions, tax amounts, settlement timestamps",
    columns: [
      { name: "purpose", type: "text", nullability: "NOT NULL", def: "'rental'", fks: "None", req: "Yes (payment categorization)", impact: "Safe default 'rental'", rec: "ADD" },
      { name: "owner_share_amount", type: "numeric(14,2)", nullability: "Nullable", def: "None", fks: "None", req: "Yes (host payout reconciliation)", impact: "Safe nullable numeric", rec: "ADD" },
      { name: "platform_fee_amount", type: "numeric(14,2)", nullability: "Nullable", def: "None", fks: "None", req: "Yes (platform commission)", impact: "Safe nullable numeric", rec: "ADD" },
      { name: "tax_amount", type: "numeric(14,2)", nullability: "NOT NULL", def: "0", fks: "None", req: "Yes (VAT/tax accounting)", impact: "Safe default 0", rec: "ADD" },
      { name: "settled_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (settlement timestamp)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "subscription_plan_id", type: "uuid", nullability: "Nullable", def: "None", fks: "FK subscription_plans(id)", req: "Yes (SaaS plan linkage)", impact: "Safe nullable FK", rec: "ADD" }
    ]
  },
  {
    table: "8. persona_template_config",
    missingCount: "1 Missing Column",
    note: "KYC persona requirement gating for driver onboarding",
    columns: [
      { name: "requires_drivers_license", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (KYC document policy)", impact: "Safe default false", rec: "ADD" }
    ]
  },
  {
    table: "9. profiles",
    missingCount: "30 Missing Columns",
    note: "Contains 39 existing destination rows. Adding columns with source defaults backfills all rows cleanly without locks",
    columns: [
      { name: "username", type: "text", nullability: "Nullable", def: "None", fks: "UNIQUE LOWER(username)", req: "Yes (unique handle)", impact: "Fixes check_unique_credentials() RPC", rec: "ADD" },
      { name: "street_address", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (physical address)", impact: "Safe nullable text", rec: "ADD" },
      { name: "city", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (user city)", impact: "Safe nullable text", rec: "ADD" },
      { name: "public_uuid", type: "uuid", nullability: "NOT NULL", def: "gen_random_uuid()", fks: "UNIQUE NOT NULL", req: "Yes (public obfuscated ID)", impact: "Auto-generates for existing 39 rows", rec: "ADD" },
      { name: "access_level", type: "access_level_enum", nullability: "NOT NULL", def: "'view_only'", fks: "Enum access_level_enum", req: "Yes (granular RBAC)", impact: "Default 'view_only'", rec: "ADD" },
      { name: "registration_stage", type: "registration_stage_enum", nullability: "Nullable", def: "None", fks: "Enum registration_stage_enum", req: "Yes (wizard stage)", impact: "Safe nullable enum", rec: "ADD" },
      { name: "stage_updated_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (stage transition time)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "onboarding_state", type: "jsonb", nullability: "NOT NULL", def: "'{}'::jsonb", fks: "None", req: "Yes (onboarding checklist)", impact: "Safe default '{}'", rec: "ADD" },
      { name: "onboarding_completed_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (onboarding signoff)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "profile_completion_skipped_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (modal dismissal state)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "owns_vehicle", type: "boolean", nullability: "Nullable", def: "None", fks: "None", req: "Yes (role survey)", impact: "Safe nullable boolean", rec: "ADD" },
      { name: "has_payment_method", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (payment readiness gate)", impact: "Safe default false", rec: "ADD" },
      { name: "payment_proxy_verified", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (card debit auth)", impact: "Safe default false", rec: "ADD" },
      { name: "driver_license_number", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (driver license record)", impact: "Safe nullable text", rec: "ADD" },
      { name: "driver_license_expiry", type: "date", nullability: "Nullable", def: "None", fks: "None", req: "Yes (license validity date)", impact: "Safe nullable date", rec: "ADD" },
      { name: "emergency_contact_name", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (next-of-kin contact)", impact: "Safe nullable text", rec: "ADD" },
      { name: "emergency_contact_phone", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (next-of-kin phone)", impact: "Safe nullable text", rec: "ADD" },
      { name: "referee_verified", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (guarantor verified flag)", impact: "Safe default false", rec: "ADD" },
      { name: "persona_verified", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (Persona KYC pass)", impact: "Safe default false", rec: "ADD" },
      { name: "identity_verification_status", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (KYC status string)", impact: "Safe nullable text", rec: "ADD" },
      { name: "identity_verified_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (KYC completion time)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "identity_verified_inquiry_id", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (external inquiry ID)", impact: "Safe nullable text", rec: "ADD" },
      { name: "persona_notification_frequency", type: "text", nullability: "NOT NULL", def: "'immediate'", fks: "None", req: "Yes (notification schedule)", impact: "Safe default 'immediate'", rec: "ADD" },
      { name: "role_change_used", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (role change enforcement)", impact: "Safe default false", rec: "ADD" },
      { name: "role_changed_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (role change timestamp)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "data_sharing_consent", type: "boolean", nullability: "NOT NULL", def: "false", fks: "None", req: "Yes (vetting consent)", impact: "Safe default false", rec: "ADD" },
      { name: "data_sharing_consent_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (vetting consent time)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "messaging_consent_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (messaging consent time)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "cookie_consent", type: "jsonb", nullability: "Nullable", def: "None", fks: "None", req: "Yes (cookie preferences)", impact: "Safe nullable JSONB", rec: "ADD" },
      { name: "cookie_consent_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (cookie decision time)", impact: "Safe nullable timestamp", rec: "ADD" }
    ]
  },
  {
    table: "10. rentals",
    missingCount: "5 Missing Columns",
    note: "Rental contract price negotiation linkage and security deposit accounting lifecycle",
    columns: [
      { name: "negotiation_id", type: "uuid", nullability: "Nullable", def: "None", fks: "FK price_negotiations(id) ON DELETE SET NULL", req: "Yes (negotiation link)", impact: "Safe nullable FK", rec: "ADD" },
      { name: "security_deposit_amount", type: "numeric(12,2)", nullability: "Nullable", def: "None", fks: "None", req: "Yes (deposit accounting)", impact: "Safe nullable numeric", rec: "ADD" },
      { name: "security_deposit_currency", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (currency code)", impact: "Safe nullable text", rec: "ADD" },
      { name: "security_deposit_status", type: "text", nullability: "NOT NULL", def: "'pending'", fks: "None", req: "Yes (deposit status)", impact: "Safe default 'pending'", rec: "ADD" },
      { name: "security_deposit_released_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (refund timestamp)", impact: "Safe nullable timestamp", rec: "ADD" }
    ]
  },
  {
    table: "11. sms_consent_records",
    missingCount: "4 Missing Columns",
    note: "TCPA compliance disclosures, keyword verification, and program versioning",
    columns: [
      { name: "keywords_shown", type: "jsonb", nullability: "NOT NULL", def: "'[]'::jsonb", fks: "None", req: "Yes (TCPA keywords)", impact: "Safe default '[]'", rec: "ADD" },
      { name: "timing_shown", type: "jsonb", nullability: "NOT NULL", def: "'[]'::jsonb", fks: "None", req: "Yes (disclosure timing)", impact: "Safe default '[]'", rec: "ADD" },
      { name: "program_version", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (terms version)", impact: "Safe nullable text", rec: "ADD" },
      { name: "page_url", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (opt-in URL)", impact: "Safe nullable text", rec: "ADD" }
    ]
  },
  {
    table: "12. support_tasks",
    missingCount: "8 Missing Columns",
    note: "Field operations insurance status, technician feedback, and supervisor verification",
    columns: [
      { name: "insurance_status", type: "insurance_task_status", nullability: "Nullable", def: "None", fks: "Enum insurance_task_status", req: "Yes (field insurance state)", impact: "Safe nullable enum", rec: "ADD" },
      { name: "verification_state", type: "text", nullability: "NOT NULL", def: "'not_submitted'", fks: "None", req: "Yes (review status)", impact: "Safe default 'not_submitted'", rec: "ADD" },
      { name: "verification_notes", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (supervisor notes)", impact: "Safe nullable text", rec: "ADD" },
      { name: "verified_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (signoff timestamp)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "verified_by", type: "uuid", nullability: "Nullable", def: "None", fks: "Admin auth UID", req: "Yes (supervisor UUID)", impact: "Safe nullable UUID", rec: "ADD" },
      { name: "staff_feedback", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (technician notes)", impact: "Safe nullable text", rec: "ADD" },
      { name: "staff_resolved_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (resolution timestamp)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "staff_resolved_by", type: "uuid", nullability: "Nullable", def: "None", fks: "Staff auth UID", req: "Yes (technician UUID)", impact: "Safe nullable UUID", rec: "ADD" }
    ]
  },
  {
    table: "13. training_completions",
    missingCount: "4 Missing Columns",
    note: "Driver training module approval lifecycle and admin supervisor signoff",
    columns: [
      { name: "verification_status", type: "text", nullability: "NOT NULL", def: "'pending'", fks: "None", req: "Yes (approval status)", impact: "Safe default 'pending'", rec: "ADD" },
      { name: "review_notes", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (reviewer notes)", impact: "Safe nullable text", rec: "ADD" },
      { name: "verified_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (approval timestamp)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "verified_by", type: "uuid", nullability: "Nullable", def: "None", fks: "Admin auth UID", req: "Yes (validator UUID)", impact: "Safe nullable UUID", rec: "ADD" }
    ]
  },
  {
    table: "14. vehicle_geofences",
    missingCount: "3 Missing Columns",
    note: "Human-readable zone naming and administrative audit trail metadata",
    columns: [
      { name: "name", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (geofence name)", impact: "Safe nullable text", rec: "ADD" },
      { name: "created_by", type: "uuid", nullability: "Nullable", def: "None", fks: "Admin auth UID", req: "Yes (creator UUID)", impact: "Safe nullable UUID", rec: "ADD" },
      { name: "updated_by", type: "uuid", nullability: "Nullable", def: "None", fks: "Admin auth UID", req: "Yes (updater UUID)", impact: "Safe nullable UUID", rec: "ADD" }
    ]
  },
  {
    table: "15. vehicles",
    missingCount: "5 Missing Columns",
    note: "Destination contains 9 active vehicles. Adding is_enabled with DEFAULT true guarantees all stay operational",
    columns: [
      { name: "is_enabled", type: "boolean", nullability: "NOT NULL", def: "true", fks: "None", req: "Yes (dispatch gate switch)", impact: "DEFAULT true keeps active 9 cars operational", rec: "ADD" },
      { name: "disabled_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (immobilization time)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "disabled_reason", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (disable reason code)", impact: "Safe nullable text", rec: "ADD" },
      { name: "enabled_at", type: "timestamptz", nullability: "Nullable", def: "None", fks: "None", req: "Yes (reactivation time)", impact: "Safe nullable timestamp", rec: "ADD" },
      { name: "lockdown_reason", type: "text", nullability: "Nullable", def: "None", fks: "None", req: "Yes (lockdown details)", impact: "Safe nullable text", rec: "ADD" }
    ]
  }
];

// -------------------------------------------------------------
// RENDER EACH TABLE AUDIT
// -------------------------------------------------------------
tableAudits.forEach((t) => {
  checkPageBreak(30);

  // Table Section Header
  doc.setFillColor(30, 41, 59); // slate-800
  doc.roundedRect(margin, y, contentWidth, 7.5, 1, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(t.table, margin + 4, y + 5.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(t.missingCount, pageWidth - margin - 4, y + 5.2, { align: "right" });

  y += 9.5;

  // Sub-note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const splitNote = doc.splitTextToSize(t.note, contentWidth - 4);
  doc.text(splitNote, margin + 2, y);
  y += splitNote.length * 3.2 + 2;

  // Table Column Headers
  checkPageBreak(12);
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 5.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);

  const colX = {
    col: margin + 2,
    type: margin + 38,
    nullDef: margin + 74,
    fks: margin + 106,
    impact: margin + 144,
    rec: pageWidth - margin - 2
  };

  doc.text("MISSING COLUMN", colX.col, y + 3.8);
  doc.text("DATA TYPE", colX.type, y + 3.8);
  doc.text("NULLABILITY / DEFAULT", colX.nullDef, y + 3.8);
  doc.text("CONSTRAINTS / FK", colX.fks, y + 3.8);
  doc.text("MIGRATION & APP IMPACT", colX.impact, y + 3.8);
  doc.text("ACTION", colX.rec, y + 3.8, { align: "right" });

  y += 6.5;

  // Column Rows
  t.columns.forEach((c, cIdx) => {
    checkPageBreak(10);

    const isEven = cIdx % 2 === 0;
    if (isEven) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 8, "F");
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 8, pageWidth - margin, y + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(15, 23, 42);
    doc.text(c.name, colX.col, y + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85);
    doc.text(c.type, colX.type, y + 4);

    const nullDefText = `${c.nullability} | Def: ${c.def}`;
    doc.setFontSize(6.5);
    doc.text(nullDefText, colX.nullDef, y + 4);

    const fkLines = doc.splitTextToSize(c.fks, 36);
    doc.text(fkLines, colX.fks, y + 3.2);

    const impactLines = doc.splitTextToSize(`${c.req} — ${c.impact}`, 32);
    doc.text(impactLines, colX.impact, y + 3.2);

    // Green Recommendation Badge
    doc.setFillColor(220, 252, 231); // emerald-100
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(pageWidth - margin - 12, y + 1.8, 10, 4.4, 1, 1, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(22, 101, 52); // emerald-800
    doc.text(c.rec, pageWidth - margin - 7, y + 4.8, { align: "center" });

    y += 8.5;
  });

  y += 4;
});

// -------------------------------------------------------------
// SUMMARY OF RECOMMENDATIONS & MIGRATION SAFETY CERTIFICATION
// -------------------------------------------------------------
checkPageBreak(45);

doc.setFillColor(240, 253, 244); // emerald-50
doc.setDrawColor(187, 247, 208); // emerald-200
doc.roundedRect(margin, y, contentWidth, 36, 2, 2, "FD");

doc.setFont("helvetica", "bold");
doc.setFontSize(9.5);
doc.setTextColor(22, 101, 52); // emerald-800
doc.text("Executive Recommendations & Zero-Downtime Migration Certification", margin + 5, y + 7);

doc.setFont("helvetica", "normal");
doc.setFontSize(7.5);
doc.setTextColor(51, 65, 85);

const recBullets = [
  "1. All 99 Missing Columns are recommended for ADD: Every single column is authentic to the production source schema.",
  "2. Non-Destructive Backfill Guarantee: All NOT NULL additions carry safe defaults ('false', 0, 'none', 'pending', true, gen_random_uuid()). Existing records (including the 39 user profiles and 9 fleet vehicles) will backfill seamlessly without row locking.",
  "3. Critical Trigger & RPC Integrity Restored: Adding referee contact fields to applications fixes validate_application_submission() trigger failures, and adding username to profiles resolves check_unique_credentials() RPC queries.",
  "4. Strict Read-Only Verification: Zero DDL operations were executed during this audit. Target database jrsydiofzceoeddjogov remains completely untouched and pristine."
];

let bY = y + 13;
recBullets.forEach((b) => {
  const lines = doc.splitTextToSize(b, contentWidth - 10);
  doc.text(lines, margin + 5, bY);
  bY += lines.length * 3.6 + 1.2;
});

y = bY + 6;

// -------------------------------------------------------------
// FOOTER & PAGE NUMBERING ACROSS ALL PAGES
// -------------------------------------------------------------
const totalPages = doc.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);

  doc.setFillColor(203, 213, 225);
  doc.rect(margin, pageHeight - 12, contentWidth, 0.4, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "RentMaikar Engineering | Schema Reconciliation Audit | bwvocmhcledbwqlpcswp -> jrsydiofzceoeddjogov",
    margin,
    pageHeight - 7.5
  );
  doc.text(
    `Page ${i} of ${totalPages}`,
    pageWidth - margin,
    pageHeight - 7.5,
    { align: "right" }
  );
}

// -------------------------------------------------------------
// OUTPUT TO DOWNLOADS DIRECTORY & PUBLIC ROOT
// -------------------------------------------------------------
const downloadsDir = path.resolve(process.cwd(), "public/downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

const outFileDownloads = path.join(downloadsDir, "rentmaikar-schema-reconciliation-report.pdf");
const outFilePublic = path.join(process.cwd(), "public/rentmaikar-schema-reconciliation-report.pdf");

const pdfData = doc.output();
fs.writeFileSync(outFileDownloads, pdfData, "binary");
fs.writeFileSync(outFilePublic, pdfData, "binary");

console.log(`[SUCCESS] PDF generated at:`);
console.log(` - ${outFileDownloads} (${(pdfData.length / 1024).toFixed(1)} KB)`);
console.log(` - ${outFilePublic} (${(pdfData.length / 1024).toFixed(1)} KB)`);
console.log(`Total Pages: ${totalPages}`);
