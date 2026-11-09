import { getDbPool } from "./dbPool";

export type MalwareScanResult =
  | { status: "clean" | "infected"; provider: string; details?: string }
  | { status: "unavailable" | "error"; provider: null; details: string };

export interface ScanInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  sha256: string;
}

export async function scanDocument(input: ScanInput): Promise<MalwareScanResult> {
  const endpoint = (process.env.DOCUMENT_SCANNER_URL || "").trim();
  const token = (process.env.DOCUMENT_SCANNER_TOKEN || "").trim();
  if (!endpoint || !token) {
    return {
      status: "unavailable",
      provider: null,
      details: "Malware scanner is not configured",
    };
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { status: "error", provider: null, details: "Malware scanner URL is invalid" };
  }
  if (url.protocol !== "https:") {
    return { status: "error", provider: null, details: "Malware scanner must use HTTPS" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
        "x-document-name": encodeURIComponent(input.fileName),
        "x-document-mime-type": input.mimeType,
        "x-document-sha256": input.sha256,
      },
      body: new Uint8Array(input.buffer),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        status: "unavailable",
        provider: null,
        details: `Malware scanner returned HTTP ${response.status}`,
      };
    }

    const result = await response.json() as { verdict?: unknown; scanner?: unknown; details?: unknown };
    if (result.verdict !== "clean" && result.verdict !== "infected") {
      return { status: "error", provider: null, details: "Malware scanner returned an invalid verdict" };
    }
    return {
      status: result.verdict,
      provider: typeof result.scanner === "string" && result.scanner.trim()
        ? result.scanner.trim().slice(0, 100)
        : "configured-scanner",
      details: typeof result.details === "string" ? result.details.slice(0, 1000) : undefined,
    };
  } catch (error) {
    return {
      status: "unavailable",
      provider: null,
      details: error instanceof Error ? error.message.slice(0, 1000) : "Malware scanner request failed",
    };
  }
}

export function isRetentionExpired(
  retentionUntil: string | Date | null | undefined,
  activeLegalHold: boolean,
  activeDispute: boolean,
  now = new Date(),
): boolean {
  if (activeLegalHold || activeDispute || !retentionUntil) return false;
  const deadline = retentionUntil instanceof Date ? retentionUntil : new Date(retentionUntil);
  return Number.isFinite(deadline.getTime()) && deadline.getTime() <= now.getTime();
}

export async function recordLifecycleEvent(
  documentId: string | null,
  eventType: string,
  details: Record<string, unknown>,
): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO public.document_lifecycle_events (document_id, event_type, details)
     VALUES ($1, $2, $3::jsonb)`,
    [documentId, eventType, JSON.stringify(details)],
  );
}
