import { describe, expect, it } from 'vitest';
import { resolveMfaAssurance } from '@/lib/mfa-assurance';

describe('MFA assurance decisions', () => {
  it('allows aal1/aal1 when policy does not require MFA', () => {
    expect(
      resolveMfaAssurance({
        requiresMfa: false,
        currentLevel: 'aal1',
        nextLevel: 'aal1',
        factors: [],
      }),
    ).toMatchObject({
      verified: true,
      requiresChallenge: false,
      requiresEnrollment: false,
    });
  });

  it('requires enrollment for a mandatory admin with no verified factor', () => {
    expect(
      resolveMfaAssurance({
        requiresMfa: true,
        currentLevel: 'aal1',
        nextLevel: 'aal1',
        factors: [{ id: 'pending', factor_type: 'totp', status: 'unverified' }],
      }),
    ).toMatchObject({
      verified: false,
      requiresChallenge: false,
      requiresEnrollment: true,
      factor: null,
    });
  });

  it('requires a challenge for aal1/aal2 when a verified TOTP exists', () => {
    expect(
      resolveMfaAssurance({
        requiresMfa: true,
        currentLevel: 'aal1',
        nextLevel: 'aal2',
        factors: [{ id: 'totp-1', factor_type: 'totp', status: 'verified' }],
      }),
    ).toMatchObject({
      verified: false,
      requiresChallenge: true,
      requiresEnrollment: false,
      factor: { id: 'totp-1' },
    });
  });

  it('still challenges an enrolled user at aal1/aal2 when MFA is optional by role', () => {
    expect(
      resolveMfaAssurance({
        requiresMfa: false,
        currentLevel: 'aal1',
        nextLevel: 'aal2',
        factors: [{ id: 'phone-1', factor_type: 'phone', status: 'verified' }],
      }),
    ).toMatchObject({
      verified: false,
      requiresChallenge: true,
      requiresEnrollment: false,
      factor: { id: 'phone-1' },
    });
  });

  it('requires enrollment if AAL2 is pending but no verified factor is listed', () => {
    expect(
      resolveMfaAssurance({
        requiresMfa: true,
        currentLevel: 'aal1',
        nextLevel: 'aal2',
        factors: [{ id: 'pending', factor_type: 'totp', status: 'unverified' }],
      }),
    ).toMatchObject({
      verified: false,
      requiresChallenge: false,
      requiresEnrollment: true,
      factor: null,
    });
  });

  it('accepts an existing aal2 session', () => {
    expect(
      resolveMfaAssurance({
        requiresMfa: true,
        currentLevel: 'aal2',
        nextLevel: 'aal2',
        factors: [{ id: 'totp-1', factor_type: 'totp', status: 'verified' }],
      }),
    ).toMatchObject({
      verified: true,
      requiresChallenge: false,
      requiresEnrollment: false,
    });
  });

  it('ignores unverified factors when selecting a challenge method', () => {
    expect(
      resolveMfaAssurance({
        requiresMfa: true,
        currentLevel: 'aal1',
        nextLevel: 'aal2',
        factors: [
          { id: 'pending-totp', factor_type: 'totp', status: 'unverified' },
          { id: 'verified-phone', factor_type: 'phone', status: 'verified' },
        ],
      }).factor,
    ).toEqual({
      id: 'verified-phone',
      factor_type: 'phone',
      status: 'verified',
    });
  });
});
