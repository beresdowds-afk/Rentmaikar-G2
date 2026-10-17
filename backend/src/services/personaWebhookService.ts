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
    // Fail closed: an unconfigured secret must never accept unsigned events.
    return false;
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
    const rawInput: unknown =
      req.rawBody ?? (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    const rawBody = Buffer.isBuffer(rawInput) ? rawInput.toString("utf8") : String(rawInput ?? "");

    if (!secret) {
      console.error("[PersonaWebhookService] PERSONA_WEBHOOK_SECRET is not configured; rejecting event");
      return { status: 503, body: { error: "Persona webhook is not configured" } };
    }
    if (!verifySignature(rawBody, signatureHeader, secret)) {
      console.warn("[PersonaWebhookService] Invalid webhook signature");
      return {
        status: 401,
        body: { error: "Invalid signature" },
      };
    }

    let evt: any = req.body;
    if (Buffer.isBuffer(evt) || typeof evt === "string") {
      evt = rawBody;
    }
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

    const eventId: string | null = evt?.data?.id ? String(evt.data.id) : null;
    const referenceId = attrs?.reference_id || attrs?.["reference-id"] || null;
    let dedupeRowId: string | null = null;

    try {
      // Only inquiries we created for a known account can change state.
      const known = await pool.query(
        `SELECT user_id FROM public.persona_inquiries WHERE inquiry_id = $1 LIMIT 1`,
        [inquiryId]
      );
      if (!known.rows[0]) {
        console.warn("[PersonaWebhookService] Event for unknown inquiry ignored");
        return { status: 200, body: { received: true, ignored: "unknown_inquiry" } };
      }
      const linkedUserId: string = known.rows[0].user_id;
      if (referenceId && String(referenceId) !== String(linkedUserId)) {
        console.warn("[PersonaWebhookService] Inquiry/account mismatch; event rejected");
        return { status: 409, body: { error: "Inquiry does not belong to the referenced account" } };
      }

      // Deduplicate on the provider's stable event id.
      if (eventId) {
        const ins = await pool.query(
          `INSERT INTO public.payment_webhook_events (provider, event_type, external_event_id, reference, status, signature_valid, payload)
           VALUES ('persona', $1, $2, $3, 'received', true, '{}'::jsonb)
           ON CONFLICT (provider, external_event_id) WHERE external_event_id IS NOT NULL DO NOTHING
           RETURNING id`,
          [String(evt?.data?.attributes?.name || "persona.event"), eventId, inquiryId]
        );
        if (!ins.rows[0]) {
          return { status: 200, body: { received: true, duplicate: true } };
        }
        dedupeRowId = ins.rows[0].id;
      }

      // An approved inquiry is never downgraded by a delayed/out-of-order event.
      const inqRes = await pool.query(
        `UPDATE public.persona_inquiries
         SET status = $1,
             verified_at = CASE WHEN $1 = 'approved' THEN now() ELSE NULL END,
             mismatch_fields = $2,
             raw_payload = $3,
             updated_at = now()
         WHERE inquiry_id = $4
           AND (status <> 'approved' OR $1 = 'approved')
         RETURNING user_id, subject_type, id`,
        [mappedStatus, JSON.stringify(mismatch), JSON.stringify(evt), inquiryId]
      );

      const targetUserId: string | null = inqRes.rows[0]?.user_id || null;

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
      if (dedupeRowId) {
        // Let Persona redeliver: drop the dedupe row so a retry is processed.
        await pool
          .query(`DELETE FROM public.payment_webhook_events WHERE id = $1`, [dedupeRowId])
          .catch(() => undefined);
      }
      return {
        status: 500,
        body: { error: "Failed to process persona verification state" },
      };
    }
  },
};
