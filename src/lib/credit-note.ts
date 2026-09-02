/**
 * Client-side builders for credit notes and refund receipts.
 *
 * Reversed / refunded / disputed payments do not produce a server-rendered
 * invoice document, so the printable HTML is composed here and handed to the
 * shared PDF renderer.
 */

export type ReversalKind = "credit_note" | "refund_receipt";

export interface ReversalDocument {
  kind: ReversalKind;
  /** Human reference, e.g. CN-2026-0007 */
  reference: string;
  amount: number;
  currency: string;
  /** Date the reversal/dispute was recorded. */
  issuedAt: string;
  /** Date of the original payment. */
  originalPaidAt?: string | null;
  originalReference?: string | null;
  provider?: string | null;
  purpose?: string | null;
  status: string;
  reason?: string | null;
  notes?: string | null;
  recipientName?: string | null;
}

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(Number(amount ?? 0));
  } catch {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }
};

const longDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }) : "—";

const esc = (v: unknown) =>
  String(v ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export const reversalTitle = (kind: ReversalKind) =>
  kind === "credit_note" ? "Credit Note" : "Refund Receipt";

/** Suggested file name (without needing the .pdf suffix). */
export const reversalFileName = (doc: ReversalDocument) =>
  `${doc.kind === "credit_note" ? "credit-note" : "refund-receipt"}-${doc.reference}-rentmaikar.pdf`;

/** Compose branded, print-ready HTML for a credit note or refund receipt. */
export function buildReversalHtml(doc: ReversalDocument): string {
  const title = reversalTitle(doc.kind);
  const rows: Array<[string, string]> = [
    ["Document type", title],
    ["Document number", esc(doc.reference)],
    ["Issued", esc(longDate(doc.issuedAt))],
    ["Original payment date", esc(longDate(doc.originalPaidAt))],
    ["Original payment reference", esc(doc.originalReference)],
    ["Payment provider", esc(doc.provider)],
    ["Applies to", esc(doc.purpose)],
    ["Status", esc(doc.status)],
    ["Reason", esc(doc.reason)],
  ];
  if (doc.notes) rows.push(["Resolution notes", esc(doc.notes)]);

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} ${esc(doc.reference)}</title></head>
<body style="margin:0;background:#ffffff;">
  <div style="width:820px;box-sizing:border-box;padding:48px;font-family:Helvetica,Arial,sans-serif;color:#0A1628;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10B981;padding-bottom:18px;">
      <div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-0.5px;">Rentmaikar</div>
        <div style="font-size:12px;color:#5b6b7f;margin-top:4px;">rentmaikar.com</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:20px;font-weight:700;color:#10B981;text-transform:uppercase;">${title}</div>
        <div style="font-size:12px;color:#5b6b7f;margin-top:4px;">${esc(doc.reference)}</div>
      </div>
    </div>

    <div style="margin-top:28px;font-size:13px;color:#5b6b7f;">Issued to</div>
    <div style="font-size:15px;font-weight:600;">${esc(doc.recipientName ?? "Account holder")}</div>

    <div style="margin-top:28px;background:#F1F6F4;border:1px solid #d8e6e0;border-radius:10px;padding:20px;">
      <div style="font-size:12px;color:#5b6b7f;text-transform:uppercase;letter-spacing:1px;">
        ${doc.kind === "credit_note" ? "Amount credited" : "Amount refunded"}
      </div>
      <div style="font-size:30px;font-weight:700;margin-top:6px;">${esc(money(doc.amount, doc.currency))}</div>
      <div style="font-size:12px;color:#5b6b7f;margin-top:6px;">Recorded ${esc(longDate(doc.issuedAt))}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-top:28px;font-size:13px;">
      ${rows.map(([k, v]) => `
        <tr>
          <td style="padding:9px 0;color:#5b6b7f;width:42%;border-bottom:1px solid #eceff3;">${k}</td>
          <td style="padding:9px 0;font-weight:600;border-bottom:1px solid #eceff3;">${v}</td>
        </tr>`).join("")}
    </table>

    <p style="margin-top:28px;font-size:11px;line-height:1.6;color:#5b6b7f;">
      This ${title.toLowerCase()} confirms that the payment above was reversed, refunded or placed under dispute.
      ${doc.kind === "credit_note"
        ? "The credited amount reduces the balance owed on the related account and does not represent a cash disbursement."
        : "Funds are returned through the original payment provider and may take up to 10 business days to appear."}
      Keep this document for your records. Questions? Contact Rentmaikar support through your dashboard.
    </p>
    <p style="margin-top:10px;font-size:10px;color:#93a1b1;">
      Generated ${esc(new Date().toLocaleString())} · Rentmaikar billing
    </p>
  </div>
</body></html>`;
}
