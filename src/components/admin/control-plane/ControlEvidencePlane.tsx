import React, { useState, useEffect } from "react";
import {
  ControlPlaneTopologyHeader,
  type ControlPlaneTabKey,
} from "./ControlPlaneTopologyHeader";
import { EventLedgerPanel } from "./EventLedgerPanel";
import { DecisionLogPanel } from "./DecisionLogPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { EvidenceStorePanel } from "./EvidenceStorePanel";
import { DisputesPanel } from "./DisputesPanel";
import { AppealsPanel } from "./AppealsPanel";
import { CompliancePanel } from "./CompliancePanel";
import { EvidenceReportingPanel } from "./EvidenceReportingPanel";
import { useSearchParams } from "react-router-dom";

export interface ControlEvidencePlaneProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  scope?: "admin" | "assistant";
}

const VALID_TABS: Set<string> = new Set([
  "event-ledger",
  "decision-log",
  "audit-log",
  "evidence-store",
  "disputes",
  "appeals",
  "compliance",
  "reporting",
]);

export const ControlEvidencePlane: React.FC<ControlEvidencePlaneProps> = ({
  activeTab: controlledTab,
  onTabChange,
  scope = "admin",
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");

  const [internalTab, setInternalTab] = useState<ControlPlaneTabKey>(() => {
    if (controlledTab && VALID_TABS.has(controlledTab)) {
      return controlledTab as ControlPlaneTabKey;
    }
    if (urlTab && VALID_TABS.has(urlTab)) {
      return urlTab as ControlPlaneTabKey;
    }
    return "event-ledger";
  });

  // Sync when controlledTab changes
  useEffect(() => {
    if (controlledTab && VALID_TABS.has(controlledTab)) {
      setInternalTab(controlledTab as ControlPlaneTabKey);
    }
  }, [controlledTab]);

  const handleSelectTab = (tab: ControlPlaneTabKey) => {
    setInternalTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    } else {
      const updated = new URLSearchParams(searchParams);
      updated.set("portal", "control-plane");
      updated.set("tab", tab);
      setSearchParams(updated, { replace: true });
    }
  };

  const currentTab = controlledTab && VALID_TABS.has(controlledTab) ? (controlledTab as ControlPlaneTabKey) : internalTab;

  return (
    <div className="space-y-6">
      {/* 1. Visual Topology Graph Header */}
      <ControlPlaneTopologyHeader
        activeTab={currentTab}
        onSelectTab={handleSelectTab}
      />

      {/* 2. Active Tab Sub-Module */}
      <div className="pt-2">
        {currentTab === "event-ledger" && <EventLedgerPanel />}
        {currentTab === "decision-log" && <DecisionLogPanel />}
        {currentTab === "audit-log" && <AuditLogPanel />}
        {currentTab === "evidence-store" && <EvidenceStorePanel />}
        {currentTab === "disputes" && <DisputesPanel />}
        {currentTab === "appeals" && <AppealsPanel />}
        {currentTab === "compliance" && <CompliancePanel />}
        {currentTab === "reporting" && <EvidenceReportingPanel />}
      </div>
    </div>
  );
};

export default ControlEvidencePlane;
