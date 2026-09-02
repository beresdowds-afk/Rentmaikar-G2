// Shared helper: verify that the caller of an edge function is an
// authenticated admin (has an `admin` role in `public.user_roles`).
// Extracted so both the runtime edge function and Deno tests can import it
// without pulling in `Deno.serve`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AdminAuthDeps {
  getUser: (token: string) => Promise<{ userId: string | null }>;
  hasAdminRole: (userId: string) => Promise<boolean>;
}

export function makeSupabaseAdminAuth(): AdminAuthDeps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon);
  const adminClient = createClient(url, service);

  return {
    async getUser(token) {
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data?.user) return { userId: null };
      return { userId: data.user.id };
    },
    async hasAdminRole(userId) {
      const { data } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  };
}

export async function isCallerAdmin(
  req: Request,
  deps: AdminAuthDeps = makeSupabaseAdminAuth(),
): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  if (!token) return false;
  const { userId } = await deps.getUser(token);
  if (!userId) return false;
  return deps.hasAdminRole(userId);
}
