import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_ANON_KEY");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const canRun = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

Deno.test({
  name: "applicants cannot provision privileged roles or approve themselves",
  ignore: !canRun,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { persistSession: false },
    });
    const email = `registration-guard-${crypto.randomUUID()}@example.test`;
    const password = `${crypto.randomUUID()}Aa1!`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { requested_role: "admin" },
    });
    assertEquals(createError, null, `create user: ${createError?.message}`);
    const userId = created.user!.id;

    try {
      const { data: assignedRoles, error: roleLookupError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      assertEquals(roleLookupError, null, `role query: ${roleLookupError?.message}`);
      assertEquals(
        assignedRoles?.map(({ role }) => role),
        ["driver"],
        "untrusted signup metadata must not grant a privileged role",
      );

      const applicant = createClient(SUPABASE_URL!, ANON_KEY!, {
        auth: { persistSession: false },
      });
      const { error: signInError } = await applicant.auth.signInWithPassword({ email, password });
      assertEquals(signInError, null, `sign in: ${signInError?.message}`);

      const { error: privilegedProvisionError } = await applicant.rpc("provision_user_account", {
        _user_id: userId,
        _role: "admin",
        _email: email,
      });
      assert(privilegedProvisionError, "authenticated applicant must not execute provisioning RPC");

      const { error: crossUserProvisionError } = await applicant.rpc("provision_user_account", {
        _user_id: crypto.randomUUID(),
        _role: "owner",
        _email: email,
      });
      assert(crossUserProvisionError, "authenticated applicant must not provision another account");

      const { error: approvalError } = await applicant.rpc("advance_registration_stage", {
        _target: "approved",
      });
      assert(approvalError, "applicant must not advance their own stage to approved");

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("registration_stage, access_level")
        .eq("user_id", userId)
        .single();
      assertEquals(profileError, null, `profile query: ${profileError?.message}`);
      assert(profile.registration_stage !== "approved", "profile must remain unapproved");
      assertEquals(profile.access_level, "view_only");
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  },
});
