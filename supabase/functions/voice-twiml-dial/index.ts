// Compatibility shim only.
//
// Canonical authority:
//   Cloud Run /api/functions/voice-twiml-dial
//
// This Supabase Edge Function intentionally contains NO independent
// voice-routing logic, region selection, caller-ID selection, or TwiML
// construction.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const base = (Deno.env.get("PUBLIC_BACKEND_URL") || "").replace(/\/+$/, "");

    if (!base) {
      return new Response("PUBLIC_BACKEND_URL is not configured", {
        status: 503,
      });
    }

    const body = await req.text();

    const response = await fetch(
      `${base}/api/functions/voice-twiml-dial`,
      {
        method: req.method,
        headers: {
          "Content-Type":
            req.headers.get("content-type") ||
            "application/x-www-form-urlencoded",
          ...(req.headers.get("x-twilio-signature")
            ? {
                "X-Twilio-Signature":
                  req.headers.get("x-twilio-signature")!,
              }
            : {}),
        },
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : body,
      },
    );

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ||
          "text/xml; charset=utf-8",
      },
    });
  } catch (error) {
    console.error(
      "[voice-twiml-dial compatibility shim] error",
      error,
    );

    return new Response("Voice routing unavailable", {
      status: 502,
    });
  }
});
