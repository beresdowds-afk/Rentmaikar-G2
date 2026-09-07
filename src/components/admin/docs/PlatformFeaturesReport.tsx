import { useState, useMemo } from "react";
import { jsPDF } from "jspdf";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Download, 
  Printer, 
  Search, 
  CheckCircle2, 
  ShieldAlert, 
  Layers, 
  Server, 
  CreditCard, 
  FileText, 
  Lock 
} from "lucide-react";
import { FEATURE_PILLARS } from "@/pages/PlatformReportPage";

export default function PlatformFeaturesReport() {
  const [searchQuery, setSearchQuery] = useState("");
  const [downloading, setDownloading] = useState(false);

  const filteredPillars = useMemo(() => {
    if (!searchQuery.trim()) return FEATURE_PILLARS;
    const q = searchQuery.toLowerCase();

    return FEATURE_PILLARS.map((pillar) => {
      const matchingFeatures = pillar.features.filter(
        (f) => f.name.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q)
      );
      const matchesTitle = pillar.title.toLowerCase().includes(q);

      if (matchesTitle) return pillar;
      if (matchingFeatures.length > 0) {
        return { ...pillar, features: matchingFeatures };
      }
      return null;
    }).filter(Boolean) as typeof FEATURE_PILLARS;
  }, [searchQuery]);

  const handleDownloadPdf = () => {
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
        doc.text("CONFIDENTIAL / INTERNAL ADMIN USE ONLY", pageWidth - margin, 9, { align: "right" });
        y = 18;
      };

      // First page header banner
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

      const dateStr = "September 2026 | Admin Portal Spec";
      doc.text(dateStr, pageWidth - margin, 24, { align: "right" });

      y = 42;

      // Overview Card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "FD");

      const metrics = [
        { label: "Total Core Features", value: "68 Modules" },
        { label: "Active App Routes", value: "71 Routes" },
        { label: "Page Controllers", value: "96 Pages" },
        { label: "Modular Components", value: "436 Elements" },
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
          `RentMaikar Internal Report | Admin Operations | Page ${i} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      }

      doc.save("rentmaikar-platform-features-report.pdf");
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Confidential Warning & Action Bar */}
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-700 dark:text-amber-300">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                  Internal Confidential Documentation
                </h3>
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 dark:text-amber-300">
                  Admins Only
                </Badge>
              </div>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                Restricted platform architecture & functional capabilities audit. Not for public distribution.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 text-xs h-8"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="gap-1.5 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-3.5 h-3.5" />
              {downloading ? "Compiling..." : "Download Official PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">68</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Core Modules</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">71</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Active Routes</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">96</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">Page Controllers</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">436</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">UI Components</div>
        </Card>
        <Card className="p-4 text-center col-span-2 sm:col-span-1">
          <div className="text-2xl font-bold text-blue-600">8</div>
          <div className="text-xs text-muted-foreground font-medium mt-1">RBAC Roles</div>
        </Card>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter features by keyword (e.g., OPay, PayPal, Traccar, Escrow, KYC)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* Feature Pillars Display */}
      <div className="space-y-6">
        {filteredPillars.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No features matched "{searchQuery}".
          </div>
        ) : (
          filteredPillars.map((pillar, idx) => (
            <Card key={idx} className="overflow-hidden">
              <CardHeader className="py-3 px-5 bg-muted/40 border-b flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${pillar.color}`} />
                  <CardTitle className="text-sm font-semibold">{pillar.title}</CardTitle>
                </div>
                <Badge variant="secondary" className="text-[11px]">
                  {pillar.count}
                </Badge>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {pillar.features.map((feat, fIdx) => (
                  <div
                    key={fIdx}
                    className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-xs leading-snug">{feat.name}</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {feat.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
