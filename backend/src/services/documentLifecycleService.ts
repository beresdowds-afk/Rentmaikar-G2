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
  // 1. Static Signature & Anti-Malware Analysis
  const eicarSignature = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
  if (input.buffer.includes(Buffer.from(eicarSignature))) {
    return {
      status: "infected",
      provider: "signature-engine",
      details: "EICAR standard anti-virus test file signature detected in document buffer",
    };
  }

  // 2. Reject binary executables masquerading as documents
  const buf = input.buffer;
  if (buf.length >= 4) {
    // Windows PE / DOS executable: 'MZ' header
    if (buf[0] === 0x4d && buf[1] === 0x5a) {
      return {
        status: "infected",
        provider: "signature-engine",
        details: "Windows PE executable binary header detected in document",
      };
    }
    // Linux ELF binary: 0x7F 'ELF'
    if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
      return {
        status: "infected",
        provider: "signature-engine",
        details: "Linux ELF executable binary header detected in document",
      };
    }
  }

  // Shell script detection masquerading as document
  if (buf.length >= 12) {
    const headerPrefix = buf.subarray(0, 32).toString("ascii").toLowerCase();
    if (
      headerPrefix.startsWith("#!/bin/sh") ||
      headerPrefix.startsWith("#!/bin/bash") ||
      headerPrefix.startsWith("#!/usr/bin")
    ) {
      return {
        status: "infected",
        provider: "heuristic-engine",
        details: "Executable shell script header detected in document",
      };
    }
  }

  // PDF Active Script Payload Analysis
  if (input.mimeType === "application/pdf" && buf.length > 32) {
    const rawPdf = buf.subarray(0, Math.min(buf.length, 32768)).toString("latin1");
    if (rawPdf.includes("/Launch") || rawPdf.includes("/EmbeddedFiles") || rawPdf.includes("/JavaScript") || rawPdf.includes("/JS")) {
      return {
        status: "infected",
        provider: "heuristic-engine",
        details: "Embedded active script (/JavaScript) or execution stream (/Launch) detected in PDF document",
      };
    }
  }

  // 3. Forward to configured External Scanner Service if present
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
