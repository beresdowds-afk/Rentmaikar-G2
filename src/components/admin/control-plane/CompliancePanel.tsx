import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileCheck2,
  CheckCircle2,
  Download,
  ShieldCheck,
  Building2,
  KeyRound,
  FileText,
  Lock,
  MessageSquare,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { download10DlcPdf } from "@/lib/generate-10dlc-pdf";

export const CompliancePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("a2p-10dlc");

  const handleDownload10DlcPdf = () => {
    try {
      download10DlcPdf("rentmaikar-10dlc-a2p-compliance-packet.pdf");
      toast.success("Rentmaikar 10DLC A2P Compliance Packet downloaded.");
    } catch {
      window.location.href = "/downloads/rentmaikar-10dlc-a2p-compliance-packet.pdf";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Compliance Score Header */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              A2P 10DLC Brand
            </CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
              VERIFIED
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-emerald-600/80">TCR Direct Carrier Vetted</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Persona KYC/AML Tier
            </CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              TIER 3 COMPLIANT
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-emerald-600/80">Biometric &amp; ID Proof active</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              NDPR Data Protection
            </CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-emerald-600">
              <Lock className="h-4 w-4" />
              AUDITED
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-emerald-600/80">Zero third-party data leakage</span>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5 shadow-sm">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-primary">Compliance Dossier</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-primary">
              <FileCheck2 className="h-4 w-4" />
              98 / 100
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-primary/80">All statutory filings current</span>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="p-5 border-b border-border/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-emerald-500" />
                Statutory Regulatory &amp; Telecom Compliance Vault
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Official evidence packets, registration tokens, carrier filings, and privacy disclosures.
              </CardDescription>
            </div>

            <Button size="sm" onClick={handleDownload10DlcPdf} className="gap-1.5 text-xs h-8">
              <Download className="h-3.5 w-3.5" />
              Download 10DLC Packet (PDF)
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-3 max-w-md">
              <TabsTrigger value="a2p-10dlc" className="text-xs">
                A2P 10DLC Messaging
              </TabsTrigger>
              <TabsTrigger value="kyc-aml" className="text-xs">
                Identity KYC/AML
              </TabsTrigger>
              <TabsTrigger value="data-privacy" className="text-xs">
                NDPR &amp; Privacy
              </TabsTrigger>
            </TabsList>

            {/* A2P 10DLC Tab */}
            <TabsContent value="a2p-10dlc" className="space-y-4 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Verified Brand Attributes
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">Legal Entity Name</span>
                      <span className="font-semibold text-foreground">Rentmaikar Global Technologies Limited</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">Brand Relationship</span>
                      <span className="font-semibold text-foreground">First-Party Operating Platform</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">Vertical</span>
                      <span className="font-semibold text-foreground">Automotive / Transportation</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">Carrier Vetting Status</span>
                      <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-[10px]">
                        VERIFIED - STANDARD
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                    Campaign Use Case Attributes
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">Campaign Type</span>
                      <span className="font-semibold text-foreground">Customer Care &amp; Account Security</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">Opt-In Consent Flow</span>
                      <span className="font-semibold text-foreground">Explicit Checkbox on Sign-Up &amp; Rental</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">HELP Keyword</span>
                      <span className="font-mono text-foreground font-semibold">Reply HELP for support</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1">
                      <span className="text-muted-foreground">STOP Keyword</span>
                      <span className="font-mono text-foreground font-semibold">Reply STOP to unsubscribe</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/20 border border-border/60">
                <span className="text-xs font-bold text-foreground block mb-1">
                  Sample Transactional Message Template (Verified on TCR)
                </span>
                <p className="font-mono text-xs text-muted-foreground p-3 rounded bg-muted/60 border border-border/40 select-all">
                  &quot;Rentmaikar: Your verification code is 849201. Valid for 10 minutes. For assistance, contact support@rentmaikar.com or reply HELP. Reply STOP to cancel.&quot;
                </p>
              </div>
            </TabsContent>

            {/* KYC Tab */}
            <TabsContent value="kyc-aml" className="space-y-4 pt-1">
              <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Identity Verification Standards (Persona + Government Proof)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded border border-border/60 bg-background/60">
                    <span className="font-bold block text-foreground mb-1">Driver Biometric Proof</span>
                    <p className="text-[11px] text-muted-foreground">
                      Persona selfie liveness check matches government ID photo with 99.4% confidence score.
                    </p>
                  </div>
                  <div className="p-3 rounded border border-border/60 bg-background/60">
                    <span className="font-bold block text-foreground mb-1">NIN / License Lookup</span>
                    <p className="text-[11px] text-muted-foreground">
                      Automated authoritative API query against national motor vehicle and identity databases.
                    </p>
                  </div>
                  <div className="p-3 rounded border border-border/60 bg-background/60">
                    <span className="font-bold block text-foreground mb-1">Referee Attestations</span>
                    <p className="text-[11px] text-muted-foreground">
                      Digital notarization requiring two independent verified guarantors before key release.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Data Privacy Tab */}
            <TabsContent value="data-privacy" className="space-y-4 pt-1">
              <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  Data Privacy, Retention &amp; Zero-Contamination Architecture
                </h4>
                <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    • <strong>Strict Storage Isolation:</strong> Personal identification documents, driver records, and inspection artifacts reside in dedicated private buckets with time-limited signed URLs only.
                  </p>
                  <p>
                    • <strong>No Unsolicited Telemarketing:</strong> RentMaikar strictly prohibits cold SMS or third-party marketing sharing. Communications are limited to explicit rental operations, safety alerts, and account notices.
                  </p>
                  <p>
                    • <strong>Audit Log Inviolability:</strong> All access to personal data, permission denials, and command dispatches are permanently stamped with immutable timestamps and correlation identifiers.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
