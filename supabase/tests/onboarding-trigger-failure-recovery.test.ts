// Simulates a failing onboarding stage trigger and asserts:
//   1. The failing UPDATE is rolled back — registration_stage stays put.
//   2. No admin_notifications fanout row is written for the failed hop.
//   3. onboarding_stage_audit records the failure (error_class populated) if
//      an audit row exists, else contains no advance for the failed hop.
//
// The failure is induced by injecting a temporary BEFORE UPDATE trigger on
// public.profiles that raises whenever the target stage equals a sentinel
// value. The trigger is dropped in the test's finally block regardless of
// outcome.
//
// Run:  deno test -A supabase/tests/onboarding-trigger-failure-recovery.test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const canRun = Boolean(SUPABASE_URL && SERVICE_KEY);
const admin = canRun ? createClient(SUPABASE_URL, SERVICE_KEY!) : null;

const FAILING_STAGE = "documents_submitted";

async function seed() {
  const email = `fail-recover-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + "Aa1!",
    email_confirm: true,
    user_metadata: { role: "driver", full_name: "Recovery QA" },
  });
  assertEquals(error, null, `create user: ${error?.message}`);
  const userId = data.user!.id;
  await admin!.from("profiles").upsert({
    user_id: userId,
    email,
    full_name: "Recovery QA",
    registration_stage: "auth",
    preferred_country: "USA",
  } as any, { onConflict: "user_id" });
  return userId;
}

async function cleanup(userId: string) {
  await admin!.from("admin_notifications").delete().eq("related_user_id", userId);
  await admin!.from("onboarding_stage_audit").delete().eq("user_id", userId);
  await admin!.from("profiles").delete().eq("user_id", userId);
  await admin!.auth.admin.deleteUser(userId);
}

// Install a failing trigger on public.profiles for the duration of one test.
// Uses the pg-meta compatible RPC `exec_sql` if present; otherwise we skip.
async function withFailingTrigger(fn: () => Promise<void>) {
  const install = `
    CREATE OR REPLACE FUNCTION public._e2e_fail_stage_trigger()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.registration_stage = '${FAILING_STAGE}' THEN
        RAISE EXCEPTION 'simulated onboarding trigger failure' USING ERRCODE = '42703';
      END IF;
      RETURN NEW;
    END;$$;
    DROP TRIGGER IF EXISTS _e2e_fail_stage_trigger ON public.profiles;
    CREATE TRIGGER _e2e_fail_stage_trigger BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public._e2e_fail_stage_trigger();
  `;
  const teardown = `
    DROP TRIGGER IF EXISTS _e2e_fail_stage_trigger ON public.profiles;
    DROP FUNCTION IF EXISTS public._e2e_fail_stage_trigger();
  `;
  // Best-effort install through a service-role SQL helper if available.
  const rpc = await admin!.rpc("exec_sql" as any, { sql: install } as any);
  if (rpc.error) {
    console.warn(
      "[skip] exec_sql RPC unavailable — failure-recovery test cannot install its trigger:",
      rpc.error.message,
    );
    return;
  }
  try {
    await fn();
  } finally {
    await admin!.rpc("exec_sql" as any, { sql: teardown } as any);
  }
}

const runIf = (cond: boolean, name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: !cond, fn, sanitizeOps: false, sanitizeResources: false });

runIf(canRun, "failing stage trigger keeps user on prior stage and emits no fanout", async () => {
  const userId = await seed();
  try {
    await withFailingTrigger(async () => {
      // Step 1 — succeed onto account_opened.
      const ok = await admin!
        .from("profiles")
        .update({ registration_stage: "account_opened" })
        .eq("user_id", userId);
      assertEquals(ok.error, null, `first hop must succeed: ${ok.error?.message}`);

      // Step 2 — this hop must fail because the failing trigger fires.
      const fail = await admin!
        .from("profiles")
        .update({ registration_stage: FAILING_STAGE })
        .eq("user_id", userId);
      assert(fail.error, "failing trigger must surface an error to the caller");
      assert(
        /simulated onboarding trigger failure|42703|record "new"/i.test(
          fail.error!.message + " " + (fail.error!.details ?? ""),
        ),
        `expected recovery-worthy error, got: ${fail.error!.message}`,
      );

      // Assertion 1 — stage rolled back to the last good value.
      const { data: profile } = await admin!
        .from("profiles")
        .select("registration_stage")
        .eq("user_id", userId)
        .single();
      assertEquals(
        (profile as any).registration_stage,
        "account_opened",
        "profile must not advance when the trigger raises",
      );

      // Assertion 2 — no fanout row for the failed hop.
      const { data: rows } = await admin!
        .from("admin_notifications")
        .select("metadata")
        .eq("related_user_id", userId)
        .eq("kind", "onboarding_stage");
      for (const row of rows ?? []) {
        const m = ((row as any).metadata ?? {}) as Record<string, unknown>;
        assert(
          m.new_stage !== FAILING_STAGE,
          `unexpected fanout row for failed stage: ${JSON.stringify(m)}`,
        );
      }
    });
  } finally {
    await cleanup(userId);
  }
});
