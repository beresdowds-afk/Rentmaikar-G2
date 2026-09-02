import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co`;

/** Fetch the server-rendered HTML for an invoice or receipt. */
export async function fetchDocumentHtml(kind: "invoice" | "receipt", id: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_URL}/billing-portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ action: "render_html", kind, id }),
  });
  if (!res.ok) throw new Error(`Unable to load ${kind}`);
  return res.text();
}

/**
 * Render an invoice/receipt to a downloadable PDF.
 * The document HTML is painted into an offscreen iframe, rasterised with
 * html2canvas and paginated onto A4 pages by jsPDF.
 */
export async function downloadDocumentPdf(
  kind: "invoice" | "receipt",
  id: string,
  fileName: string,
): Promise<void> {
  const html = await fetchDocumentHtml(kind, id);
  await downloadHtmlAsPdf(html, fileName);
}

/** Rasterise arbitrary document HTML into a paginated A4 PDF download. */
export async function downloadHtmlAsPdf(html: string, fileName: string): Promise<void> {


  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Renderer unavailable");
    doc.open();
    doc.write(html);
    doc.close();

    // Give fonts/images a beat to settle before rasterising.
    await new Promise((r) => setTimeout(r, 350));

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const target = (doc.body.firstElementChild as HTMLElement) ?? doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: 820,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.92);

    let remaining = imgH;
    let offset = 0;
    pdf.addImage(img, "JPEG", 0, 0, pageW, imgH);
    remaining -= pageH;
    while (remaining > 0) {
      offset += pageH;
      pdf.addPage();
      pdf.addImage(img, "JPEG", 0, -offset, pageW, imgH);
      remaining -= pageH;
    }

    pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
  } finally {
    iframe.remove();
  }
}
