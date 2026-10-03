import { createHash } from "node:crypto";
import { getDbPool } from "./dbPool";

/**
 * Authoritative cryptographic hash generator for files, documents, and payloads.
 */
export function sha256(buffer: Buffer | string): string {
  const buf = typeof buffer === "string" ? Buffer.from(buffer, "utf8") : buffer;
  return createHash("sha256").update(buf).digest("hex");
}

export function computeCustodyHash(
  artifactId: string,
  contentSha256: string,
  capturedAt: string | Date,
  capturedBy: string | null | undefined,
  previousArtifactHash: string | null | undefined
): string {
  const prev = previousArtifactHash || "GENESIS_EVIDENCE_ROOT_0000000000000000000000000000000000000000000000000000000000000000";
  const dateStr = capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt;
  const canonical = `${artifactId}:${contentSha256}:${dateStr}:${capturedBy || "system"}:${prev}`;
  return sha256(canonical);
}

export interface RegisterArtifactInput {
  evidenceType: "document" | "inspection" | "legal_agreement" | "incident_photo" | "referee_attestation" | "appeal";
  sourceTable: string;
  sourceId: string;
  storageBucket?: string;
  storagePath?: string;
  contentBuffer?: Buffer;
  contentSha256?: string;
  capturedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Registers an authoritative evidence artifact into the cryptographic evidence store.
 */
export async function registerEvidenceArtifact(input: RegisterArtifactInput): Promise<{
  id: string;
  contentSha256: string;
  custodyHash: string;
}> {
  const pool = getDbPool();
  const contentHash = input.contentSha256 || (input.contentBuffer ? sha256(input.contentBuffer) : "");
  if (!contentHash) {
    throw new Error("Cannot register evidence artifact without valid content hash or buffer");
  }

  // Fetch previous custody hash for hash-chaining
  let prevHash = "GENESIS_EVIDENCE_ROOT_0000000000000000000000000000000000000000000000000000000000000000";
  try {
    const prevRes = await pool.query(
      `SELECT custody_hash FROM public.evidence_artifacts ORDER BY captured_at DESC LIMIT 1`
    );
    if (prevRes.rows[0]?.custody_hash) {
      prevHash = prevRes.rows[0].custody_hash;
    }
  } catch (err) {
    console.warn("[evidenceHashService] Could not query previous custody hash, starting chain at genesis:", err);
  }

  const now = new Date();
  const artifactId = (await import("node:crypto")).randomUUID();
  const custodyHash = computeCustodyHash(artifactId, contentHash, now, input.capturedBy, prevHash);

  await pool.query(
    `
      INSERT INTO public.evidence_artifacts (
        id,
        evidence_type,
        source_table,
        source_id,
        storage_bucket,
        storage_path,
        content_sha256,
        captured_at,
        captured_by,
        previous_artifact_hash,
        custody_hash,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      artifactId,
      input.evidenceType,
      input.sourceTable,
      input.sourceId,
      input.storageBucket || null,
      input.storagePath || null,
      contentHash,
      now.toISOString(),
      input.capturedBy || null,
      prevHash,
      custodyHash,
      JSON.stringify(input.metadata || {}),
    ]
  );

  return {
    id: artifactId,
    contentSha256: contentHash,
    custodyHash,
  };
}
