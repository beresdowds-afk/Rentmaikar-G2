import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { requireServiceRole } from "../_shared/auth-guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PHOTO_LABELS: Record<string, string> = {
  photo_front_view: "Front View",
  photo_back_view: "Back View",
  photo_driver_side: "Driver's Side",
  photo_passenger_side: "Passenger Side",
  photo_front_right_tyre: "Front Right Tyre",
  photo_front_left_tyre: "Front Left Tyre",
  photo_back_left_tyre: "Back Left Tyre",
  photo_back_right_tyre: "Back Right Tyre",
  photo_dashboard: "Dashboard",
  photo_interior: "Full Interior",
};

interface InspectionReport {
  id: string;
  vehicle_id: string;
  driver_id: string;
  owner_id: string | null;
  week_start_date: string;
  submitted_at: string | null;
  photo_front_view: string | null;
  photo_back_view: string | null;
  photo_driver_side: string | null;
  photo_passenger_side: string | null;
  photo_front_right_tyre: string | null;
  photo_front_left_tyre: string | null;
  photo_back_left_tyre: string | null;
  photo_back_right_tyre: string | null;
  photo_dashboard: string | null;
  photo_interior: string | null;
  photo_timestamps: Record<string, string>;
  status: string;
  owner_reviewed_at: string | null;
  owner_notes: string | null;
  owner_action: string | null;
  admin_reviewed_at: string | null;
  admin_decision: string | null;
  admin_notes: string | null;
  created_at: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { reportId, vehicleInfo, driverInfo, ownerInfo } = await req.json();

    if (!reportId) {
      return new Response(
        JSON.stringify({ error: "Report ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the inspection report
    const { data: report, error: reportError } = await supabase
      .from("weekly_inspection_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return new Response(
        JSON.stringify({ error: "Report not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inspectionReport = report as InspectionReport;

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = 20;

    // Helper function to add text with word wrap
    const addText = (text: string, fontSize: number = 10, isBold: boolean = false) => {
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, pageWidth - 2 * margin);
      doc.text(lines, margin, yPos);
      yPos += lines.length * (fontSize * 0.4) + 2;
    };

    const addSection = (title: string) => {
      yPos += 5;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 102, 204);
      doc.text(title, margin, yPos);
      yPos += 6;
      doc.setDrawColor(0, 102, 204);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);
    };

    const checkPageBreak = (neededSpace: number = 30) => {
      if (yPos + neededSpace > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }
    };

    // Header
    doc.setFillColor(0, 102, 204);
    doc.rect(0, 0, pageWidth, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("WEEKLY VEHICLE INSPECTION REPORT", margin, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Report ID: ${inspectionReport.id.slice(0, 8).toUpperCase()}`, margin, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin - 60, 28);
    
    yPos = 45;
    doc.setTextColor(0, 0, 0);

    // Report Summary
    addSection("REPORT SUMMARY");
    const weekDate = new Date(inspectionReport.week_start_date);
    addText(`Week Starting: ${weekDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
    addText(`Submission Date: ${inspectionReport.submitted_at ? new Date(inspectionReport.submitted_at).toLocaleString() : "Not submitted"}`);
    addText(`Status: ${inspectionReport.status.toUpperCase().replace(/_/g, " ")}`);

    // Vehicle Information
    checkPageBreak();
    addSection("VEHICLE INFORMATION");
    addText(`Vehicle ID: ${inspectionReport.vehicle_id.slice(0, 8).toUpperCase()}`);
    if (vehicleInfo) {
      addText(`Make/Model: ${vehicleInfo.make || "N/A"} ${vehicleInfo.model || ""}`);
      addText(`Year: ${vehicleInfo.year || "N/A"}`);
      addText(`License Plate: ${vehicleInfo.licensePlate || "N/A"}`);
    }

    // Driver Information
    checkPageBreak();
    addSection("DRIVER INFORMATION");
    addText(`Driver ID: ${inspectionReport.driver_id.slice(0, 8).toUpperCase()}`);
    if (driverInfo) {
      addText(`Name: ${driverInfo.name || "N/A"}`);
      addText(`Email: ${driverInfo.email || "N/A"}`);
    }

    // Owner Information
    if (inspectionReport.owner_id) {
      checkPageBreak();
      addSection("OWNER INFORMATION");
      addText(`Owner ID: ${inspectionReport.owner_id.slice(0, 8).toUpperCase()}`);
      if (ownerInfo) {
        addText(`Name: ${ownerInfo.name || "N/A"}`);
        addText(`Email: ${ownerInfo.email || "N/A"}`);
      }
    }

    // Photo Summary
    checkPageBreak();
    addSection("INSPECTION PHOTOS SUMMARY");
    
    const photoKeys = Object.keys(PHOTO_LABELS) as (keyof typeof PHOTO_LABELS)[];
    const uploadedPhotos = photoKeys.filter(key => inspectionReport[key as keyof InspectionReport]);
    const missingPhotos = photoKeys.filter(key => !inspectionReport[key as keyof InspectionReport]);

    addText(`Total Photos Uploaded: ${uploadedPhotos.length} of ${photoKeys.length}`, 11, true);
    yPos += 3;

    // Uploaded photos table
    if (uploadedPhotos.length > 0) {
      addText("Uploaded Photos:", 10, true);
      uploadedPhotos.forEach((key) => {
        const timestamp = inspectionReport.photo_timestamps?.[key];
        const timeStr = timestamp ? new Date(timestamp).toLocaleString() : "No timestamp";
        addText(`  ✓ ${PHOTO_LABELS[key]} - Captured: ${timeStr}`);
      });
    }

    yPos += 3;

    // Missing photos
    if (missingPhotos.length > 0) {
      addText("Missing Photos:", 10, true);
      doc.setTextColor(200, 0, 0);
      missingPhotos.forEach((key) => {
        addText(`  ✗ ${PHOTO_LABELS[key]} - NOT SUBMITTED`);
      });
      doc.setTextColor(0, 0, 0);
    }

    // Photo URLs Reference
    checkPageBreak();
    addSection("PHOTO REFERENCES");
    addText("The following URLs can be used to access the original inspection photos:");
    yPos += 3;
    
    uploadedPhotos.forEach((key) => {
      checkPageBreak(15);
      addText(`${PHOTO_LABELS[key]}:`, 9, true);
      const url = inspectionReport[key as keyof InspectionReport] as string;
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 200);
      const urlLines = doc.splitTextToSize(url, pageWidth - 2 * margin);
      doc.text(urlLines, margin + 5, yPos);
      yPos += urlLines.length * 3 + 4;
      doc.setTextColor(0, 0, 0);
    });

    // Owner Review
    if (inspectionReport.owner_reviewed_at) {
      checkPageBreak();
      addSection("OWNER REVIEW");
      addText(`Review Date: ${new Date(inspectionReport.owner_reviewed_at).toLocaleString()}`);
      addText(`Action: ${inspectionReport.owner_action?.toUpperCase().replace(/_/g, " ") || "N/A"}`);
      if (inspectionReport.owner_notes) {
        addText("Owner Notes:", 10, true);
        addText(`"${inspectionReport.owner_notes}"`);
      }
    }

    // Admin Decision
    if (inspectionReport.admin_reviewed_at) {
      checkPageBreak();
      addSection("ADMIN DECISION");
      addText(`Decision Date: ${new Date(inspectionReport.admin_reviewed_at).toLocaleString()}`);
      addText(`Decision: ${inspectionReport.admin_decision?.toUpperCase().replace(/_/g, " ") || "N/A"}`);
      if (inspectionReport.admin_notes) {
        addText("Admin Notes:", 10, true);
        addText(`"${inspectionReport.admin_notes}"`);
      }
    }

    // Footer
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Page ${i} of ${totalPages} | RentMaiKar Weekly Inspection Report | Confidential`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }

    // Compliance Notice
    doc.setPage(totalPages);
    yPos = doc.internal.pageSize.getHeight() - 40;
    doc.setFillColor(245, 245, 245);
    doc.rect(margin - 5, yPos - 5, pageWidth - 2 * margin + 10, 25, "F");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text("COMPLIANCE NOTICE", margin, yPos);
    yPos += 5;
    doc.setFontSize(7);
    doc.text(
      "This document is generated automatically for insurance and compliance purposes. All timestamps are recorded",
      margin,
      yPos
    );
    yPos += 4;
    doc.text(
      "at the time of photo upload. This report should be retained for a minimum of 3 years per regulatory requirements.",
      margin,
      yPos
    );

    // Generate PDF as base64
    const pdfBase64 = doc.output("datauristring");

    return new Response(
      JSON.stringify({ 
        pdf: pdfBase64,
        filename: `inspection-report-${inspectionReport.week_start_date}-${inspectionReport.id.slice(0, 8)}.pdf`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate PDF" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
