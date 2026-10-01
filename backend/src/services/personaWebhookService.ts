import crypto from "crypto";
import { getDbPool } from "./dbPool";
import { supabaseBackendService } from "./supabaseService";

export interface PersonaWebhookResult {
  status: number;
  body: Record<string, any>;
}

const STATUS_MAP: Record<string, string> = {
  approved: "approved",
  completed: "approved",
  declined: "declined",
  failed: "declined",
  needs_review: "needs_review",
  pending: "pending",
  expired: "expired",
};

function verifySignature(rawBody: string, signatureHeader: string | undefined, secret: string | undefined): boolean {
  if (!secret) {
    // If secret is not configured in environment, permit in test/dev
    return true;
  }
  if (!signatureHeader) {
    return false;
  }

  const tokens = signatureHeader.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  let timestamp = "";
  const signatures: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("t=")) {
      timestamp = token.slice(2);
    } else if (token.startsWith("v1=")) {
      signatures.push(token.slice(3));
    } else if (token.length === 64) {
      signatures.push(token);
    }
  }

  if (timestamp && signatures.length > 0) {
    const payloadToSign = `${timestamp}.${rawBody}`;
    const hmac = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");
    if (signatures.some((sig) => sig.toLowerCase() === hmac.toLowerCase())) {
      return true;
    }
  }

  // Fallback direct body signature
  const directHmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return signatures.some((sig) => sig.toLowerCase() === directHmac.toLowerCase()) ||
    signatureHeader.toLowerCase() === directHmac.toLowerCase();
}

function collectMismatches(attrs: any): Record<string, unknown> {
  const mm: Record<string, unknown> = {};
  const checks = attrs?.checks ?? attrs?.["checks"] ?? [];
  if (Array.isArray(checks)) {
    for (const c of checks) {
      const st = c?.status ?? c?.attributes?.status;
      if (st && st !== "passed") {
        mm[c?.name ?? c?.attributes?.name ?? "unknown"] = {
          status: st,
          reasons: c?.reasons ?? c?.attributes?.reasons,
        };
      }
    }
  }
  const dr = attrs?.["decision-reason"] ?? attrs?.decision_reason;
  if (dr) mm._decision_reason = dr;
  return mm;
}

export const personaWebhookService = {
  async handle(req: {
    headers: Record<string, any>;
    body: any;
    rawBody?: string;
  }): Promise<PersonaWebhookResult> {
    const secret = process.env.PERSONA_WEBHOOK_SECRET;
    const signatureHeader = req.headers["persona-signature"] || req.headers["Persona-Signature"];
    const rawBody = req.rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    if (secret && !verifySignature(rawBody, signatureHeader, secret)) {
      console.warn("[PersonaWebhookService] Invalid signature header:", signatureHeader);
      return {
        status: 401,
        body: { error: "Invalid signature" },
      };
    }

    let evt: any = req.body;
    if (typeof evt === "string") {
      try {
        evt = JSON.parse(evt);
      } catch {
        return {
          status: 400,
          body: { error: "Malformed JSON payload" },
        };
      }
    }

    const inquiry = evt?.data?.attributes?.payload?.data ?? evt?.data;
    const inquiryId = inquiry?.id ?? inquiry?.attributes?.["inquiry-id"];
    const attrs = inquiry?.attributes ?? {};
    const rawStatus = String(attrs?.status || "").toLowerCase();
    const mappedStatus = STATUS_MAP[rawStatus] || "pending";

    if (!inquiryId) {
      return {
        status: 400,
        body: { error: "Missing inquiry ID in payload" },
      };
    }

    const pool = getDbPool();
    const mismatch = collectMismatches(attrs);

    try {
      // 1. Update persona_inquiries table
      const inqRes = await pool.query(
        `UPDATE public.persona_inquiries
         SET status = $1,
             verified_at = CASE WHEN $1 = 'approved' THEN now() ELSE NULL END,
             mismatch_fields = $2,
             raw_payload = $3,
             updated_at = now()
         WHERE inquiry_id = $4
         RETURNING user_id, subject_type, id`,
        [mappedStatus, JSON.stringify(mismatch), JSON.stringify(evt), inquiryId]
      );

      let targetUserId: string | null = inqRes.rows[0]?.user_id || null;

      // 2. If user_id wasn't in persona_inquiries, try matching reference_id
      if (!targetUserId) {
        const referenceId = attrs?.reference_id || attrs?.["reference-id"];
        if (referenceId) {
          targetUserId = referenceId;
        }
      }

      // 3. Update public.profiles if user resolved
      if (targetUserId) {
        await pool.query(
          `UPDATE public.profiles
           SET identity_verification_status = $1,
               identity_verified_at = CASE WHEN $1 = 'approved' THEN now() ELSE NULL END,
               identity_verified_inquiry_id = CASE WHEN $1 = 'approved' THEN $2 ELSE NULL END,
               updated_at = now()
           WHERE user_id = $3`,
          [mappedStatus, inquiryId, targetUserId]
        );

        // 4. Update driver/owner application status if pending
        if (mappedStatus === "approved") {
          await pool.query(
            `UPDATE public.applications
             SET status = 'approved',
                 reviewed_at = now(),
                 review_notes = COALESCE(review_notes, '') || ' [Automated Persona KYC Approval]',
                 updated_at = now()
             WHERE user_id = $1 AND status = 'pending'`,
            [targetUserId]
          );
        }

        // 5. Record admin audit log
        await pool.query(
          `INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
           VALUES ('00000000-0000-0000-0000-000000000000', 'persona_kyc_processed', 'profiles', $1, $2)`,
          [
            targetUserId,
            JSON.stringify({
              inquiry_id: inquiryId,
              raw_status: rawStatus,
              mapped_status: mappedStatus,
              mismatches: Object.keys(mismatch).length,
            }),
          ]
        );
      }

      return {
        status: 200,
        body: {
          received: true,
          inquiryId,
          status: mappedStatus,
          userId: targetUserId,
        },
      };
    } catch (dbErr: any) {
      console.error("[PersonaWebhookService] Database update failed:", dbErr.message);
      return {
        status: 500,
        body: {
          error: "Failed to process persona verification state",
          details: dbErr.message,
        },
      };
    }
  },
};
