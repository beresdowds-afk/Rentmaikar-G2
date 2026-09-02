// End-to-end test verifying Google SSO auto-provisioning:
//   1. A Google-shaped signup (admin.createUser with OAuth metadata) auto-creates
//      the profile (full_name, email, avatar_url, preferred_country from locale)
//      AND assigns a default 'driver' role so the dashboard is reachable.
//   2. The seeded admin email (eastfortemain@gmail.com) is auto-promoted to
//      'admin' on first signup (no 'driver' fallback row).
//   3. Session persistence: signing in with a password produces a session whose
//      access token still validates as the same user after re-hydration.
//
// Run:  deno test -A supabase/tests/google-sso-provisioning-e2e.test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const canRun = Boolean(SUPABASE_URL && SERVICE_KEY);
const runIf = (cond: boolean, name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: !cond, fn, sanitizeOps: false, sanitizeResources: false });

const admin = canRun ? createClient(SUPABASE_URL, SERVICE_KEY!) : null;

async function cleanup(uid: string) {
  await admin!.from("user_roles").delete().eq("user_id", uid);
  await admin!.from("profiles").delete().eq("user_id", uid);
  await admin!.auth.admin.deleteUser(uid).catch(() => {});
}

runIf(canRun, "Google SSO first sign-in auto-provisions profile + driver role", async () => {
  const email = `e2e-google-sso-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin!.auth.admin.createUser({
    email, email_confirm: true,
    user_metadata: {
      iss: "https://accounts.google.com", provider_id: "google",
      given_name: "Grace", family_name: "Hopper", name: "Grace Hopper",
      picture: "https://example.test/g.png", email, email_verified: true,
      locale: "en-US",
    },
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const uid = data.user.id;
  try {
    const { data: profile } = await admin!.from("profiles")
      .select("full_name, email, avatar_url, preferred_country").eq("user_id", uid).maybeSingle();
    assert(profile, "profile auto-created");
    assertEquals(profile!.full_name, "Grace Hopper");
    assertEquals(profile!.avatar_url, "https://example.test/g.png");
    assertEquals(profile!.preferred_country, "US");

    const { data: role } = await admin!.from("user_roles")
      .select("role").eq("user_id", uid).maybeSingle();
    assertEquals(role?.role, "driver", "default driver role assigned on first Google sign-in");
  } finally {
    await cleanup(uid);
  }
});

runIf(canRun, "Seeded admin email is auto-promoted to admin on signup", async () => {
  // Ensure a clean slate for the seeded admin so we can observe the trigger.
  const existing = await admin!.auth.admin.listUsers();
  const prior = existing.data.users.find(u => (u.email || "").toLowerCase() === "eastfortemain@gmail.com");
  if (prior) {
    await cleanup(prior.id);
  }
  const { data, error } = await admin!.auth.admin.createUser({
    email: "eastfortemain@gmail.com", email_confirm: true,
    user_metadata: { name: "East Fortemain", provider_id: "google" },
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const uid = data.user.id;
  try {
    const { data: roles } = await admin!.from("user_roles").select("role").eq("user_id", uid);
    const names = (roles || []).map(r => r.role);
    assert(names.includes("admin"), "admin role auto-assigned to seeded email");
    assert(!names.includes("driver"), "seeded admin should not also get driver fallback");
  } finally {
    await cleanup(uid);
  }
});

runIf(canRun && !!ANON_KEY, "Session persists across client rehydration", async () => {
  const email = `e2e-session-${crypto.randomUUID()}@example.test`;
  const password = "TempPass!123";
  const { data: created } = await admin!.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: "Session Tester" },
  });
  const uid = created!.user!.id;
  try {
    const c1 = createClient(SUPABASE_URL, ANON_KEY!, { auth: { persistSession: false } });
    const { data: signIn, error: signErr } = await c1.auth.signInWithPassword({ email, password });
    if (signErr) throw signErr;
    assert(signIn.session?.access_token, "access token issued");

    // Rehydrate on a fresh client using setSession — mirrors what happens on
    // a full app reload where the SDK reads the persisted session.
    const c2 = createClient(SUPABASE_URL, ANON_KEY!, { auth: { persistSession: false } });
    const { error: setErr } = await c2.auth.setSession({
      access_token: signIn.session!.access_token,
      refresh_token: signIn.session!.refresh_token,
    });
    if (setErr) throw setErr;
    const { data: userAfter, error: getErr } = await c2.auth.getUser();
    if (getErr) throw getErr;
    assertEquals(userAfter.user?.id, uid, "same user after rehydration = session persists");
  } finally {
    await cleanup(uid);
  }
});
