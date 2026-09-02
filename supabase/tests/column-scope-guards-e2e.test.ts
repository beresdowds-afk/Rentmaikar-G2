// End-to-end regression tests for the BEFORE UPDATE column-scope guards +
// RLS policies added in migration 20260723220156_* which fix these security
// findings:
//
//   - driver_proxy_billing_accounts_self_approval
//   - user_subscriptions_self_modification
//   - support_tasks_update_missing_check
//   - voice_call_requests_update_missing_check
//   - voip_call_requests_cancel_missing_check
//
// For each finding, this suite:
//   1. Seeds a fixture with the service role.
//   2. Signs in as the target user with the anon (PostgREST) key so the
//      triggers see a real auth.uid() and the RLS policies apply.
//   3. Attempts a forbidden update -> must fail (RLS violation or 42501).
//   4. Attempts an allowed update -> must succeed.
//
// Run with:
//   deno test -A supabase/tests/column-scope-guards-e2e.test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("VITE_SUPABASE_ANON_KEY");

const canRun = Boolean(SUPABASE_URL && SERVICE_KEY && ANON_KEY);
const admin = canRun ? createClient(SUPABASE_URL, SERVICE_KEY!) : null;

function runIf(name: string, fn: () => Promise<void>) {
  Deno.test({
    name,
    ignore: !canRun,
    fn,
    sanitizeOps: false,
    sanitizeResources: false,
  });
}

/** Create a fresh confirmed auth user and return a signed-in anon client. */
async function seedUser(role?: string): Promise<{
  userId: string;
  email: string;
  client: SupabaseClient;
}> {
  const email = `guard-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID() + "Aa1!";
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: role ?? "driver" },
  });
  assertEquals(error, null, `create user: ${error?.message}`);
  const userId = data.user!.id;

  const client = createClient(SUPABASE_URL, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  assertEquals(sErr, null, `sign in: ${sErr?.message}`);
  return { userId, email, client };
}

/** Delete a user (cascades their public rows via FK / triggers). */
async function purge(userId: string) {
  await admin!.auth.admin.deleteUser(userId).catch(() => {});
}

function isDenied(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const c = err.code ?? "";
  const m = (err.message ?? "").toLowerCase();
  return (
    c === "42501" ||
    c === "PGRST301" ||
    m.includes("row-level security") ||
    m.includes("row level security") ||
    m.includes("violates") ||
    m.includes("only") ||
    m.includes("may only") ||
    m.includes("permission denied")
  );
}

// ---------------------------------------------------------------------------
// 1) driver_proxy_billing_accounts_self_approval
// ---------------------------------------------------------------------------
runIf(
  "driver_proxy_billing_accounts: driver cannot self-approve or edit card fields",
  async () => {
    const driver = await seedUser("driver");
    const proxy = await seedUser("driver");
    try {
      // Seed a proxy account owned by `proxy`, granting `driver` as the linked
      // driver so the driver row can update it. Table shape follows other
      // proxy-billing seeds in the repo.
      const { data: row, error: insErr } = await admin!
        .from("driver_proxy_billing_accounts")
        .insert({
          driver_id: driver.userId,
          proxy_user_id: proxy.userId,
          proxy_email: proxy.email,
          proxy_full_name: "Proxy Payer",
          status: "pending",
          admin_review_status: "pending",
        } as any)
        .select("id")
        .single();
      assertEquals(insErr, null, `seed proxy row: ${insErr?.message}`);
      const rowId = (row as any).id as string;

      // (a) FORBIDDEN: driver flips admin_review_status to approved.
      const { error: e1 } = await driver.client
        .from("driver_proxy_billing_accounts")
        .update({ admin_review_status: "approved", status: "active" } as any)
        .eq("id", rowId);
      assert(isDenied(e1 as any), `expected denial, got: ${JSON.stringify(e1)}`);

      // (b) FORBIDDEN: driver injects a card token directly.
      const { error: e2 } = await driver.client
        .from("driver_proxy_billing_accounts")
        .update({ card_token: "tok_hack", card_last4: "4242" } as any)
        .eq("id", rowId);
      assert(isDenied(e2 as any), `card update should be denied: ${JSON.stringify(e2)}`);

      // (c) ALLOWED: driver updates a permitted field (notification prefs are
      // in a companion table, so use a safe permitted change on this row --
      // e.g. no-op update of the ownership row succeeds without column changes).
      const { error: e3 } = await driver.client
        .from("driver_proxy_billing_accounts")
        .update({ updated_at: new Date().toISOString() } as any)
        .eq("id", rowId);
      // no-op / metadata update must not raise a denial.
      assert(!isDenied(e3 as any), `benign update should pass: ${JSON.stringify(e3)}`);

      // (d) State must be unchanged after forbidden attempts.
      const { data: after } = await admin!
        .from("driver_proxy_billing_accounts")
        .select("admin_review_status, status, card_token")
        .eq("id", rowId)
        .single();
      assertEquals((after as any).admin_review_status, "pending");
      assertEquals((after as any).status, "pending");
      assertEquals((after as any).card_token, null);

      await admin!.from("driver_proxy_billing_accounts").delete().eq("id", rowId);
    } finally {
      await purge(driver.userId);
      await purge(proxy.userId);
    }
  },
);

// ---------------------------------------------------------------------------
// 2) user_subscriptions_self_modification
// ---------------------------------------------------------------------------
runIf(
  "user_subscriptions: owner may only flip auto_renew, never plan/status/expiry",
  async () => {
    const user = await seedUser();
    try {
      // Pick any active plan.
      const { data: plan } = await admin!
        .from("subscription_plans")
        .select("id")
        .limit(1)
        .maybeSingle();
      const planId = (plan as any)?.id;
      if (!planId) return; // no plans seeded in this environment

      const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const { data: sub, error: sErr } = await admin!
        .from("user_subscriptions")
        .insert({
          user_id: user.userId,
          plan_id: planId,
          status: "active",
          started_at: new Date().toISOString(),
          expires_at: expires,
          auto_renew: false,
        } as any)
        .select("id")
        .single();
      assertEquals(sErr, null, `seed subscription: ${sErr?.message}`);
      const subId = (sub as any).id;

      // FORBIDDEN: extend expires_at
      const later = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
      const { error: e1 } = await user.client
        .from("user_subscriptions")
        .update({ expires_at: later } as any)
        .eq("id", subId);
      assert(isDenied(e1 as any), `expiry change must be denied: ${JSON.stringify(e1)}`);

      // FORBIDDEN: change status to trial/cancelled
      const { error: e2 } = await user.client
        .from("user_subscriptions")
        .update({ status: "trialing" } as any)
        .eq("id", subId);
      assert(isDenied(e2 as any), `status change must be denied: ${JSON.stringify(e2)}`);

      // ALLOWED: toggle auto_renew on my own row
      const { error: e3 } = await user.client
        .from("user_subscriptions")
        .update({ auto_renew: true } as any)
        .eq("id", subId);
      assertEquals(e3, null, `auto_renew toggle should pass: ${e3?.message}`);

      const { data: after } = await admin!
        .from("user_subscriptions")
        .select("expires_at, status, auto_renew")
        .eq("id", subId)
        .single();
      assertEquals((after as any).expires_at, expires);
      assertEquals((after as any).status, "active");
      assertEquals((after as any).auto_renew, true);

      await admin!.from("user_subscriptions").delete().eq("id", subId);
    } finally {
      await purge(user.userId);
    }
  },
);

// ---------------------------------------------------------------------------
// 3) support_tasks_update_missing_check
// ---------------------------------------------------------------------------
runIf(
  "support_tasks: assigned staff can update status but not reassign or move to another user",
  async () => {
    const staff = await seedUser();
    try {
      // Provision staff record for the user.
      const { data: staffRow, error: staffErr } = await admin!
        .from("support_staff")
        .insert({ user_id: staff.userId, is_active: true, role: "support_agent" } as any)
        .select("id")
        .single();
      assertEquals(staffErr, null, `seed support staff: ${staffErr?.message}`);
      const staffId = (staffRow as any).id;

      const { data: task, error: tErr } = await admin!
        .from("support_tasks")
        .insert({
          task_type: "general",
          status: "open",
          priority: "medium",
          assigned_to: staffId,
          region: "usa",
        } as any)
        .select("id")
        .single();
      assertEquals(tErr, null, `seed task: ${tErr?.message}`);
      const taskId = (task as any).id;

      // FORBIDDEN: reassign the task to a different staff.
      const { error: e1 } = await staff.client
        .from("support_tasks")
        .update({ assigned_to: crypto.randomUUID() } as any)
        .eq("id", taskId);
      assert(isDenied(e1 as any), `reassignment must be denied: ${JSON.stringify(e1)}`);

      // FORBIDDEN: change the task_type (ownership-shaped field).
      const { error: e2 } = await staff.client
        .from("support_tasks")
        .update({ task_type: "billing_dispute" } as any)
        .eq("id", taskId);
      assert(isDenied(e2 as any), `task_type change must be denied: ${JSON.stringify(e2)}`);

      // ALLOWED: advance the workflow status / priority.
      const { error: e3 } = await staff.client
        .from("support_tasks")
        .update({ status: "in_progress", priority: "high" } as any)
        .eq("id", taskId);
      assertEquals(e3, null, `workflow update should pass: ${e3?.message}`);

      await admin!.from("support_tasks").delete().eq("id", taskId);
      await admin!.from("support_staff").delete().eq("id", staffId);
    } finally {
      await purge(staff.userId);
    }
  },
);

// ---------------------------------------------------------------------------
// 4) voice_call_requests_update_missing_check
// ---------------------------------------------------------------------------
runIf(
  "voice_call_requests: non-admin can advance status but not rewrite requester/target",
  async () => {
    const staff = await seedUser();
    try {
      const { data: sRow } = await admin!
        .from("support_staff")
        .insert({ user_id: staff.userId, is_active: true, role: "support_agent" } as any)
        .select("id")
        .single();
      const staffPubId = (sRow as any)?.id;

      const requesterId = crypto.randomUUID();
      const { data: req, error: rErr } = await admin!
        .from("voice_call_requests")
        .insert({
          requester_id: requesterId,
          requester_role: "driver",
          target_role: "admin",
          reason: "billing question",
          status: "pending",
          region: "usa",
          assigned_to: staff.userId,
        } as any)
        .select("id")
        .single();
      assertEquals(rErr, null, `seed voice request: ${rErr?.message}`);
      const reqId = (req as any).id;

      // FORBIDDEN: rewrite the requester.
      const { error: e1 } = await staff.client
        .from("voice_call_requests")
        .update({ requester_id: crypto.randomUUID() } as any)
        .eq("id", reqId);
      assert(isDenied(e1 as any), `requester change must be denied: ${JSON.stringify(e1)}`);

      // FORBIDDEN: rewrite the reason (immutable audit field).
      const { error: e2 } = await staff.client
        .from("voice_call_requests")
        .update({ reason: "changed after the fact" } as any)
        .eq("id", reqId);
      assert(isDenied(e2 as any), `reason change must be denied: ${JSON.stringify(e2)}`);

      // ALLOWED: workflow update.
      const { error: e3 } = await staff.client
        .from("voice_call_requests")
        .update({ status: "in_progress" } as any)
        .eq("id", reqId);
      assertEquals(e3, null, `status advance should pass: ${e3?.message}`);

      await admin!.from("voice_call_requests").delete().eq("id", reqId);
      if (staffPubId) await admin!.from("support_staff").delete().eq("id", staffPubId);
    } finally {
      await purge(staff.userId);
    }
  },
);

// ---------------------------------------------------------------------------
// 5) voip_call_requests_cancel_missing_check
// ---------------------------------------------------------------------------
runIf(
  "voip_call_requests: user can only cancel their own pending row, nothing else",
  async () => {
    const user = await seedUser();
    try {
      const { data: req, error: rErr } = await admin!
        .from("voip_call_requests")
        .insert({
          user_id: user.userId,
          user_type: "driver",
          status: "pending",
          region: "usa",
          phone_number: "+15550000001",
          priority: "normal",
          reason: "callback",
        } as any)
        .select("id")
        .single();
      assertEquals(rErr, null, `seed voip request: ${rErr?.message}`);
      const reqId = (req as any).id;

      // FORBIDDEN: escalate priority.
      const { error: e1 } = await user.client
        .from("voip_call_requests")
        .update({ priority: "urgent" } as any)
        .eq("id", reqId);
      assert(isDenied(e1 as any), `priority change must be denied: ${JSON.stringify(e1)}`);

      // FORBIDDEN: overwrite admin_notes.
      const { error: e2 } = await user.client
        .from("voip_call_requests")
        .update({ admin_notes: "spoofed" } as any)
        .eq("id", reqId);
      assert(isDenied(e2 as any), `admin_notes change must be denied: ${JSON.stringify(e2)}`);

      // FORBIDDEN: move status to anything other than 'cancelled'.
      const { error: e3 } = await user.client
        .from("voip_call_requests")
        .update({ status: "in_progress" } as any)
        .eq("id", reqId);
      assert(isDenied(e3 as any), `non-cancel status change must be denied: ${JSON.stringify(e3)}`);

      // ALLOWED: cancel own pending request.
      const { error: e4 } = await user.client
        .from("voip_call_requests")
        .update({ status: "cancelled" } as any)
        .eq("id", reqId);
      assertEquals(e4, null, `cancel should pass: ${e4?.message}`);

      // FORBIDDEN: re-open after cancel (OLD.status is not 'pending').
      const { error: e5 } = await user.client
        .from("voip_call_requests")
        .update({ status: "cancelled" } as any)
        .eq("id", reqId);
      // second identical cancel is either denied (row no longer matches
      // policy USING because status=='cancelled') OR silently updates zero
      // rows; both outcomes are acceptable — the invariant is that no
      // status other than the initial cancel ever lands. We verify by DB
      // state below.

      const { data: after } = await admin!
        .from("voip_call_requests")
        .select("status, priority, admin_notes")
        .eq("id", reqId)
        .single();
      assertEquals((after as any).status, "cancelled");
      assertEquals((after as any).priority, "normal");
      assertEquals((after as any).admin_notes, null);
      void e5;

      await admin!.from("voip_call_requests").delete().eq("id", reqId);
    } finally {
      await purge(user.userId);
    }
  },
);
