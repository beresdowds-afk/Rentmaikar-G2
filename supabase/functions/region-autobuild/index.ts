import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Input validation ────────────────────────────────────────────────────────
const BuildSchema = z.object({
  country_name: z.string().trim().min(2).max(80),
  country_code: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
  currency_symbol: z.string().trim().min(1).max(4),
  phone_prefix: z.string().trim().regex(/^\+\d{1,4}$/),
  timezone: z.string().trim().max(64).optional(),
  primary_language: z.string().trim().min(2).max(8).optional(),
  sms_provider: z.enum(["twilio", "termii"]).optional(),
  voice_provider: z.enum(["twilio", "termii"]).optional(),
  whatsapp_provider: z.enum(["twilio", "termii"]).optional(),
  payment_gateway: z.enum(["paypal", "paystack", "stripe", "flutterwave"]).optional(),
  support_hours: z.string().trim().max(64).optional(),
  whatsapp_number: z.string().trim().max(32).optional(),
  sms_number: z.string().trim().max(32).optional(),
  flag_emoji: z.string().trim().max(8).optional(),
  cultural_tone: z.string().trim().max(500).optional(),
  preview_only: z.boolean().optional(),
});
type BuildRequest = z.infer<typeof BuildSchema>;

const CONTENT_KEYS = ["hero", "category", "how_it_works", "features", "cta", "testimonials"] as const;
type ContentKey = typeof CONTENT_KEYS[number];

// ── Prompt builder (unchanged shape) ────────────────────────────────────────
const prompt = (spec: BuildRequest, key: ContentKey) => {
  const base = `You are localizing a rideshare vehicle rental platform ("Rentmaikar") for a new region.
Region: ${spec.country_name} (${spec.country_code})
Currency: ${spec.currency} (${spec.currency_symbol})
Payment gateway: ${spec.payment_gateway ?? "paypal"}
Cultural tone: ${spec.cultural_tone ?? "trustworthy, community-oriented"}
Language: ${spec.primary_language ?? "en"}
Return STRICT JSON, no prose, no markdown fences.`;
  const schemas: Record<ContentKey, string> = {
    hero: `{"badge":"","headline":"","highlightedWord":"","description":"","primaryCta":"","secondaryCta":"","whatsappCta":"","smsCta":""}`,
    category: `{"sectionBadge":"","sectionTitle":"","sectionDescription":"","budget":{"title":"","description":"","priceLabel":"","minPriceLabel":""},"standard":{"title":"","description":"","priceLabel":"","minPriceLabel":""},"premium":{"title":"","description":"","priceLabel":"","minPriceLabel":""},"viewCta":""}`,
    how_it_works: `{"sectionBadge":"","sectionTitle":"","sectionDescription":"","steps":[{"title":"","description":""},{"title":"","description":""},{"title":"","description":""},{"title":"","description":""}]}`,
    features: `{"sectionBadge":"","sectionTitle":"","sectionDescription":"","features":[{"title":"","description":""},{"title":"","description":""},{"title":"","description":""},{"title":"","description":""},{"title":"","description":""},{"title":"","description":""}]}`,
    cta: `{"driver":{"title":"","description":"","cta":""},"owner":{"title":"","description":"","cta":""}}`,
    testimonials: `{"sectionTitle":"","testimonials":[{"name":"","location":"","platform":"","quote":"","earning":""},{"name":"","location":"","platform":"","quote":""},{"name":"","location":"","platform":"","quote":""}]}`,
  };
  return `${base}\nGenerate content for "${key}" matching this exact JSON schema (fill values, keep keys):\n${schemas[key]}\nUse realistic local names, cities, and rideshare platforms popular in ${spec.country_name}. Format prices with ${spec.currency_symbol}.`;
};

async function generateContent(spec: BuildRequest, key: ContentKey, apiKey: string): Promise<any> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You output STRICT JSON only. No markdown fences." },
        { role: "user", content: prompt(spec, key) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI ${key} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  let text: string = data?.choices?.[0]?.message?.content ?? "";
  text = text.trim().replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  return JSON.parse(text);
}

// ── Rate limiting: 5 builds / admin / hour ─────────────────────────────────
const RATE_LIMIT = 5;
const WINDOW_MINUTES = 60;

async function enforceRateLimit(admin: ReturnType<typeof createClient>, userId: string) {
  const sinceIso = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await admin
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("identifier", userId)
    .eq("endpoint", "region-autobuild")
    .gte("window_start", sinceIso);
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  if ((count ?? 0) >= RATE_LIMIT) {
    const err = new Error(`Rate limit exceeded: max ${RATE_LIMIT} builds per ${WINDOW_MINUTES} minutes`);
    (err as any).status = 429;
    throw err;
  }
  await admin.from("rate_limit_log").insert({
    identifier: userId,
    endpoint: "region-autobuild",
    request_count: 1,
  });
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden: admin role required" }, 403);

    // Validate body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = BuildSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    const spec = parsed.data;

    await enforceRateLimit(admin, userData.user.id);

    // Preview-only mode: generate content without touching region_definitions.
    if (spec.preview_only) {
      const preview: Record<string, unknown> = {};
      for (const key of CONTENT_KEYS) {
        preview[key] = await generateContent(spec, key, lovableKey);
      }
      return json({ success: true, preview, spec });
    }

    // Upsert region definition with queued -> building progress.
    const { data: region, error: upsertErr } = await admin
      .from("region_definitions")
      .upsert(
        {
          country_name: spec.country_name,
          country_code: spec.country_code.toUpperCase(),
          currency: spec.currency.toUpperCase(),
          currency_symbol: spec.currency_symbol,
          phone_prefix: spec.phone_prefix,
          timezone: spec.timezone,
          primary_language: spec.primary_language ?? "en",
          sms_provider: spec.sms_provider ?? "twilio",
          voice_provider: spec.voice_provider ?? "twilio",
          whatsapp_provider: spec.whatsapp_provider ?? "twilio",
          payment_gateway: spec.payment_gateway ?? "paypal",
          support_hours: spec.support_hours,
          whatsapp_number: spec.whatsapp_number,
          sms_number: spec.sms_number,
          flag_emoji: spec.flag_emoji,
          cultural_tone: spec.cultural_tone,
          status: "building",
          build_error: null,
          build_log: [{ event: "queued", at: new Date().toISOString() }],
          created_by: userData.user.id,
        },
        { onConflict: "country_code" }
      )
      .select()
      .single();
    if (upsertErr || !region) throw new Error(upsertErr?.message ?? "upsert failed");

    const log: any[] = [{ event: "queued", at: new Date().toISOString() }];
    try {
      for (let i = 0; i < CONTENT_KEYS.length; i++) {
        const key = CONTENT_KEYS[i];
        const started = Date.now();
        log.push({ event: "step_started", key, index: i, total: CONTENT_KEYS.length, at: new Date().toISOString() });
        await admin.from("region_definitions").update({ status: "building", build_log: log }).eq("id", region.id);

        const content = await generateContent(spec, key, lovableKey);
        await admin.from("region_localized_content").upsert(
          {
            region_id: region.id,
            content_key: key,
            content,
            generated_by: "ai:gemini-2.5-flash",
          },
          { onConflict: "region_id,content_key" }
        );
        log.push({ event: "step_done", key, ms: Date.now() - started });
        await admin.from("region_definitions").update({ build_log: log }).eq("id", region.id);
      }
      log.push({ event: "succeeded", at: new Date().toISOString() });
      await admin.from("region_definitions").update({ status: "ready", build_log: log }).eq("id", region.id);
    } catch (genErr: any) {
      log.push({ event: "failed", error: genErr.message, at: new Date().toISOString() });
      await admin.from("region_definitions")
        .update({ status: "failed", build_error: genErr.message, build_log: log })
        .eq("id", region.id);
      throw genErr;
    }

    return json({ success: true, region_id: region.id, log });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return json({ error: e?.message ?? String(e) }, status);
  }
});
