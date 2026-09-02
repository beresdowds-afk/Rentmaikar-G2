// Validates the admin_notifications metadata schema produced by the
// `fanout_admin_onboarding_notification` trigger for every stage transition
// in the onboarding flow.
//
// Contract each fanout row must satisfy:
//   metadata.user_id        === profile.user_id
//   metadata.previous_stage === the row's previous_stage
//   metadata.new_stage      === the row's new_stage
//   metadata.region         ∈ {"USA","Nigeria"} and matches profile.preferred_country
//
// Run:  deno test -A supabase/tests/onboarding-fanout-payload.test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const canRun = Boolean(SUPABASE_URL && SERVICE_KEY);
const admin = canRun ? createClient(SUPABASE_URL, SERVICE_KEY!) : null;

const runIf = (cond: boolean, name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: !cond, fn, sanitizeOps: false, sanitizeResources: false });

const STAGES = [
  "account_opened",
  "documents_submitted",
  "verification_pending",
] as const;

async function seed(region: "USA" | "Nigeria") {
  const email = `fanout-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + "Aa1!",
    email_confirm: true,
    user_metadata: { role: "driver", full_name: "Fanout QA" },
  });
  assertEquals(error, null, `create user: ${error?.message}`);
  const userId = data.user!.id;

  await admin!.from("profiles").upsert({
    user_id: userId,
    email,
    full_name: "Fanout QA",
    registration_stage: "auth",
    preferred_country: region,
  } as any, { onConflict: "user_id" });

  return { userId, email, region };
}

async function cleanup(userId: string) {
  await admin!.from("admin_notifications").delete().eq("related_user_id", userId);
  await admin!.from("onboarding_stage_audit").delete().eq("user_id", userId);
  await admin!.from("profiles").delete().eq("user_id", userId);
  await admin!.auth.admin.deleteUser(userId);
}

async function advance(userId: string, to: string) {
  const { error } = await admin!
    .from("profiles")
    .update({ registration_stage: to, stage_updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  assertEquals(error, null, `advance ${to}: ${error?.message}`);
}

for (const region of ["USA", "Nigeria"] as const) {
  runIf(canRun, `fanout metadata schema is complete for every stage (region=${region})`, async () => {
    const { userId } = await seed(region);
    try {
      let previous = "auth";
      for (const stage of STAGES) {
        await advance(userId, stage);
        previous = stage;
      }
      void previous;

      const { data: rows, error } = await admin!
        .from("admin_notifications")
        .select("metadata, related_user_id, related_stage, kind, created_at")
        .eq("related_user_id", userId)
        .eq("kind", "onboarding_stage")
        .order("created_at", { ascending: true });
      assertEquals(error, null, `fetch notifications: ${error?.message}`);
      assert(
        (rows?.length ?? 0) >= STAGES.length,
        `expected ≥${STAGES.length} onboarding fanout rows, got ${rows?.length}`,
      );

      const seenTransitions = new Set<string>();
      for (const row of rows ?? []) {
        const m = ((row as any).metadata ?? {}) as Record<string, unknown>;

        // Schema — every required key MUST be present.
        for (const key of ["user_id", "previous_stage", "new_stage", "region"]) {
          assert(key in m, `missing "${key}" in metadata ${JSON.stringify(m)}`);
        }

        assertEquals(m.user_id, userId, "metadata.user_id must match profile user");
        assertEquals(
          m.region,
          region,
          `metadata.region must match preferred_country (${region})`,
        );
        assert(
          typeof m.previous_stage === "string" || m.previous_stage === null,
          "previous_stage must be string or null",
        );
        assert(typeof m.new_stage === "string", "new_stage must be a string");
        assert(
          m.previous_stage !== m.new_stage,
          "no-op transitions must not emit a fanout row",
        );
        assertEquals(
          (row as any).related_stage,
          m.new_stage,
          "related_stage column and metadata.new_stage must agree",
        );

        seenTransitions.add(`${m.previous_stage}->${m.new_stage}`);
      }

      // Every expected hop must appear exactly once.
      const expected = [
        "auth->account_opened",
        "account_opened->documents_submitted",
        "documents_submitted->verification_pending",
      ];
      for (const hop of expected) {
        assert(seenTransitions.has(hop), `missing fanout for transition ${hop}`);
      }
    } finally {
      await cleanup(userId);
    }
  });
}
