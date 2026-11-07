export function hasFullAdministratorRole(
  roles: readonly { role: string }[] | null | undefined,
): boolean {
  return Boolean(roles?.some(({ role }) => role === "admin"));
}
