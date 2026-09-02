/**
 * When referee contact details (home address + email) are mandatory.
 *
 * Referee details exist to support identity/background checks. They are only
 * demanded when BOTH are true:
 *   1. The admin has identity gating (Persona verification) switched ON, and
 *   2. The application type is one that requires referee vetting.
 *
 * With Persona gating off, the fields stay visible but optional so applicants
 * are never blocked by data we aren't going to check.
 */
export type RefereeApplicationType = 'driver' | 'owner';

/** Application types whose referees must supply an address and email. */
export const APPLICATION_TYPES_REQUIRING_REFEREE_DETAILS: RefereeApplicationType[] = ['driver'];

export function refereeDetailsRequired(
  personaEnabled: boolean,
  applicationType: RefereeApplicationType,
): boolean {
  return (
    personaEnabled &&
    APPLICATION_TYPES_REQUIRING_REFEREE_DETAILS.includes(applicationType)
  );
}
