// Compatibility shim only.
//
// Canonical authority:
//   Cloud Run /api/functions/voice-twiml-config
//
// TwiML Application configuration is no longer maintained independently
// inside Supabase Edge Functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const base = (Deno.env.get("PUBLIC_BACKEND_URL") || "").replace(
      /\/+$/,
      "",
    );

    if (!base) {
      return new Response(
        JSON.stringify({
          error: "PUBLIC_BACKEND_URL is not configured",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.text();

    const response = await fetch(
      `${base}/api/functions/voice-twiml-config`,
      {
        method: req.method,
        headers: {
          "Content-Type":
            req.headers.get("content-type") ||
            "application/json",
          ...(req.headers.get("authorization")
            ? {
                Authorization:
                  req.headers.get("authorization")!,
              }
            : {}),
        },
        body,
      },
    );

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ||
          "application/json",
      },
    });
  } catch (error) {
    console.error(
      "[voice-twiml-config compatibility shim] error",
      error,
    );

    return new Response(
      JSON.stringify({
        error: "Voice configuration unavailable",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});
