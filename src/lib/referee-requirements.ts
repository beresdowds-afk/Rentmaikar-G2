export function refereeDetailsRequired(personaEnabled: boolean, role = 'driver'): boolean {
  // When automated identity verification (Persona) is not enabled, detailed referee checks are required
  return !personaEnabled;
}
