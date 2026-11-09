export const PROVISIONABLE_USER_ROLES = [
  "admin",
  "admin_assistant",
  "owner",
  "driver",
  "legal_support",
  "iot_support",
  "vehicle_support",
  "insurance_support",
] as const;

export type ProvisionableUserRole = typeof PROVISIONABLE_USER_ROLES[number];

export function isProvisionableUserRole(role: string): role is ProvisionableUserRole {
  return PROVISIONABLE_USER_ROLES.includes(role as ProvisionableUserRole);
}

export function canProvisionUserAccount(
  caller: { userId: string; roles: readonly string[] },
  targetUserId: string,
  targetRole: string,
): boolean {
  if (!isProvisionableUserRole(targetRole)) return false;
  if (caller.roles.includes("admin")) return true;

  return (
    targetUserId === caller.userId &&
    (targetRole === "driver" || targetRole === "owner")
  );
}
