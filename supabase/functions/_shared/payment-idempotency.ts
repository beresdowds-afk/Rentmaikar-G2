// Request-level idempotency for money-moving edge functions.
//
// Clients send an `Idempotency-Key` header (or `idempotencyKey` in the body).
// The first request claims the key; concurrent or repeated requests with the
// same key short-circuit and replay the stored response instead of charging
// or paying out twice. Keys are stored in public.payment_idempotency_keys and
// are only reachable by service_role.
//
// deno-lint-ignore-file no-explicit-any

export interface IdempotencyClaim {
  key: string | null;
  claimed: boolean;
  status?: string;
  storedResponse?: unknown;
}

/** Derive a stable key from the request headers/body, or generate one. */
export function resolveIdempotencyKey(req: Request, body: Record<string, unknown> = {}): string | null {
  const header = req.headers.get("Idempotency-Key") ?? req.headers.get("x-idempotency-key");
  const fromBody = typeof body.idempotencyKey === "string" ? body.idempotencyKey : null;
  const key = (header || fromBody || "").trim();
  if (!key) return null;
  return key.slice(0, 200);
}

export async function hashRequest(payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(payload ?? {}));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function claimIdempotencyKey(
  supabase: any,
  key: string | null,
  scope: string,
  userId?: string | null,
  requestPayload?: unknown,
): Promise<IdempotencyClaim> {
  if (!key) return { key: null, claimed: true };
  const requestHash = requestPayload === undefined ? null : await hashRequest(requestPayload);
  const { data, error } = await supabase.rpc("claim_idempotency_key", {
    _key: key,
    _scope: scope,
    _user_id: userId ?? null,
    _request_hash: requestHash,
  });
  if (error) {
    // Fail open on infrastructure errors — DB-level unique constraints on
    // transactions/receipts remain the last line of defence.
    console.error("claim_idempotency_key failed", error.message);
    return { key, claimed: true };
  }
  return {
    key,
    claimed: Boolean(data?.claimed),
    status: data?.status,
    storedResponse: data?.response,
  };
}

export async function completeIdempotencyKey(
  supabase: any,
  key: string | null,
  status: "succeeded" | "failed",
  response?: unknown,
): Promise<void> {
  if (!key) return;
  const { error } = await supabase.rpc("complete_idempotency_key", {
    _key: key,
    _status: status,
    _response: response ?? null,
  });
  if (error) console.error("complete_idempotency_key failed", error.message);
}

/** Standard 409 response for an in-flight duplicate request. */
export function duplicateResponse(claim: IdempotencyClaim, corsHeaders: Record<string, string>): Response {
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  if (claim.status === "succeeded" && claim.storedResponse) {
    return new Response(JSON.stringify({ ...(claim.storedResponse as Record<string, unknown>), replayed: true }), {
      status: 200,
      headers,
    });
  }
  return new Response(
    JSON.stringify({
      error: "duplicate_request",
      message: "An identical request is already being processed. Please wait before retrying.",
      status: claim.status ?? "in_progress",
    }),
    { status: 409, headers },
  );
}

/**
 * Wrap a money-moving handler with claim → run → complete semantics.
 */
export async function withIdempotency<T>(
  supabase: any,
  opts: { key: string | null; scope: string; userId?: string | null; requestPayload?: unknown; corsHeaders: Record<string, string> },
  handler: () => Promise<{ body: T; status?: number }>,
): Promise<Response> {
  const claim = await claimIdempotencyKey(supabase, opts.key, opts.scope, opts.userId, opts.requestPayload);
  if (!claim.claimed) return duplicateResponse(claim, opts.corsHeaders);

  try {
    const { body, status } = await handler();
    const ok = (status ?? 200) < 400;
    await completeIdempotencyKey(supabase, claim.key, ok ? "succeeded" : "failed", ok ? body : null);
    return new Response(JSON.stringify(body), {
      status: status ?? 200,
      headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await completeIdempotencyKey(supabase, claim.key, "failed");
    throw e;
  }
}
