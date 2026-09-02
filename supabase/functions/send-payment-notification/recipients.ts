// deno-lint-ignore-file no-explicit-any
// Extracted for unit testing without pulling npm:web-push into the test graph.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Compute the payment-notification recipient set.
 *
 * Policy (defense in depth):
 *   - INCLUDE: the rental's driver_id, only if they hold the 'driver' role.
 *   - INCLUDE: every user with the 'admin' role.
 *   - EXCLUDE: any user with the 'owner' role, even if they also match
 *     driver_id or the admin list. Owners never receive payment push
 *     notifications for any PSP.
 */
export async function resolveRecipients(
  admin: Pick<SupabaseClient, "from">,
  rentalId: string | undefined,
): Promise<string[]> {
  const candidates = new Set<string>();
  let rentalDriverId: string | null = null;

  if (rentalId) {
    const { data: rental } = await (admin.from("rentals") as any)
      .select("driver_id").eq("id", rentalId).maybeSingle();
    if (rental?.driver_id) {
      rentalDriverId = rental.driver_id;
      candidates.add(rental.driver_id);
    }
  }

  const { data: admins } = await (admin.from("user_roles") as any)
    .select("user_id").eq("role", "admin");
  (admins ?? []).forEach((a: { user_id: string }) => candidates.add(a.user_id));

  if (candidates.size === 0) return [];

  const { data: allRoles } = await (admin.from("user_roles") as any)
    .select("user_id, role").in("user_id", Array.from(candidates));

  const rolesByUser = new Map<string, Set<string>>();
  (allRoles ?? []).forEach((r: { user_id: string; role: string }) => {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, new Set());
    rolesByUser.get(r.user_id)!.add(r.role);
  });

  const allowed: string[] = [];
  for (const userId of candidates) {
    const roles = rolesByUser.get(userId) ?? new Set<string>();
    if (roles.has("owner")) continue; // hard exclusion
    if (userId === rentalDriverId) {
      if (roles.has("driver")) allowed.push(userId);
      continue;
    }
    if (roles.has("admin")) allowed.push(userId);
  }
  return allowed;
}
