import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  FileSpreadsheet,
  Gavel,
  History,
  Archive,
  Scale,
  FileCheck2,
  FileText,
  CheckCircle2,
  Lock,
  ArrowDown,
  Layers,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ControlPlaneTabKey =
  | "event-ledger"
  | "decision-log"
  | "audit-log"
  | "evidence-store"
  | "disputes"
  | "appeals"
  | "compliance"
  | "reporting";

interface ControlPlaneTopologyHeaderProps {
  activeTab: ControlPlaneTabKey;
  onSelectTab: (tab: ControlPlaneTabKey) => void;
  metrics?: {
    ledgerCount?: number;
    decisionCount?: number;
    auditCount?: number;
    evidenceCount?: number;
    disputesCount?: number;
    appealsCount?: number;
    complianceScore?: number;
    reportsCount?: number;
  };
}

export const ControlPlaneTopologyHeader: React.FC<ControlPlaneTopologyHeaderProps> = ({
  activeTab,
  onSelectTab,
  metrics = {},
}) => {
  const {
    ledgerCount = 284,
    decisionCount = 142,
    auditCount = 890,
    evidenceCount = 67,
    disputesCount = 3,
    appealsCount = 2,
    complianceScore = 98,
    reportsCount = 12,
  } = metrics;

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-b from-card via-card/95 to-muted/30 p-5 shadow-sm">
      {/* Background Architectural Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-40" />

      {/* Header Title & Status */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/25 shadow-inner">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                CONTROL &amp; EVIDENCE PLANE
              </h2>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-xs font-semibold gap-1 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                IMMUTABLE AUDIT AUTHORITY
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authoritative, tamper-evident governance substrate separate from operational application workflows.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground mr-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span>SHA-256 Validated</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Zero-Contamination</span>
            </div>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            v2.4 Production Resilience
          </Badge>
        </div>
      </div>

      {/* Interactive Topology Graph Tree */}
      <div className="relative z-10 mt-5 pt-1">
        {/* Tier 1: Event Ledger, Decision Log, Audit Log */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Node: Event Ledger */}
          <button
            type="button"
            onClick={() => onSelectTab("event-ledger")}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
              activeTab === "event-ledger"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                : "border-border/80 bg-background/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-blue-500" />
                <span>EVENT LEDGER</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {ledgerCount} txs
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              Double-entry debits, credits, and state transitions with cryptographic balance verification.
            </p>
            {activeTab === "event-ledger" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-b-lg" />
            )}
          </button>

          {/* Node: Decision Log */}
          <button
            type="button"
            onClick={() => onSelectTab("decision-log")}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
              activeTab === "decision-log"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                : "border-border/80 bg-background/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-foreground">
                <Gavel className="h-4 w-4 text-amber-500" />
                <span>DECISION LOG</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {decisionCount} rulings
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              Automated policy rulings, human approvals, underwriting overrides, and formal reasons.
            </p>
            {activeTab === "decision-log" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-b-lg" />
            )}
          </button>

          {/* Node: Audit Log */}
          <button
            type="button"
            onClick={() => onSelectTab("audit-log")}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
              activeTab === "audit-log"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                : "border-border/80 bg-background/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-foreground">
                <History className="h-4 w-4 text-purple-500" />
                <span>AUDIT LOG</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {auditCount} events
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              Security access denials, hardware IoT commands, SMS consent, and document export records.
            </p>
            {activeTab === "audit-log" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-b-lg" />
            )}
          </button>
        </div>

        {/* Central Convergence Connector */}
        <div className="flex justify-center items-center py-2.5">
          <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-mono bg-muted/60 px-3 py-1 rounded-full border border-border/60">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>Cryptographic Convergence Stream</span>
            <ArrowDown className="h-3 w-3" />
          </div>
        </div>

        {/* Central Hub: EVIDENCE STORE */}
        <div className="max-w-xl mx-auto mb-2.5">
          <button
            type="button"
            onClick={() => onSelectTab("evidence-store")}
            className={cn(
              "w-full group relative flex flex-col items-center text-center p-3.5 rounded-xl border transition-all",
              activeTab === "evidence-store"
                ? "border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md"
                : "border-primary/40 bg-card hover:bg-muted/30 hover:border-primary/60"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <Badge variant="outline" className="text-[9px] uppercase border-primary/30 bg-primary/5 text-primary">
                Authoritative Central Vault
              </Badge>
              <div className="flex items-center gap-2 font-bold text-sm tracking-wider uppercase text-foreground">
                <Archive className="h-4 w-4 text-primary" />
                <span>EVIDENCE STORE</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {evidenceCount} verified artifacts
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Inspection bundles, digitally signed contracts, referee affidavits, and immutable proof artifacts.
            </p>
            {activeTab === "evidence-store" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-b-xl" />
            )}
          </button>
        </div>

        {/* Divergence Connector to Adjudication & Compliance */}
        <div className="flex justify-center items-center py-2">
          <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-mono bg-muted/60 px-3 py-1 rounded-full border border-border/60">
            <ArrowDown className="h-3 w-3" />
            <span>Adjudication &amp; Regulatory Verification</span>
          </div>
        </div>

        {/* Tier 2: Left (Disputes & Appeals), Right (Compliance & Reporting) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Node: Disputes */}
          <button
            type="button"
            onClick={() => onSelectTab("disputes")}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
              activeTab === "disputes"
                ? "border-destructive bg-destructive/5 ring-2 ring-destructive/20 shadow-sm"
                : "border-border/80 bg-background/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-foreground">
                <Scale className="h-4 w-4 text-rose-500" />
                <span>DISPUTES</span>
              </div>
              <Badge variant={disputesCount > 0 ? "destructive" : "secondary"} className="text-[10px] font-mono px-1.5 py-0">
                {disputesCount} active
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              Payment chargebacks, damage claims, and arbitration cases with evidence attachment.
            </p>
            {activeTab === "disputes" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-destructive rounded-b-lg" />
            )}
          </button>

          {/* Node: Appeals */}
          <button
            type="button"
            onClick={() => onSelectTab("appeals")}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
              activeTab === "appeals"
                ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20 shadow-sm"
                : "border-border/80 bg-background/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-foreground">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span>APPEALS</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {appealsCount} pending
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              Appellate reconsideration for rejected applicants, referee appeals, and sanctions.
            </p>
            {activeTab === "appeals" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-b-lg" />
            )}
          </button>

          {/* Node: Compliance */}
          <button
            type="button"
            onClick={() => onSelectTab("compliance")}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
              activeTab === "compliance"
                ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20 shadow-sm"
                : "border-border/80 bg-background/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-foreground">
                <FileCheck2 className="h-4 w-4 text-emerald-500" />
                <span>COMPLIANCE</span>
              </div>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-[10px] font-mono px-1.5 py-0">
                {complianceScore}% pass
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              A2P 10DLC registration, Persona KYC/AML verification status, and regulatory certificates.
            </p>
            {activeTab === "compliance" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-b-lg" />
            )}
          </button>

          {/* Node: Reporting */}
          <button
            type="button"
            onClick={() => onSelectTab("reporting")}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
              activeTab === "reporting"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                : "border-border/80 bg-background/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-foreground">
                <FileText className="h-4 w-4 text-blue-500" />
                <span>REPORTING</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {reportsCount} dossiers
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              Generate self-contained, printable Evidence Dossiers for regulators, insurers, and auditors.
            </p>
            {activeTab === "reporting" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-b-lg" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
