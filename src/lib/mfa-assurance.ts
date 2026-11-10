export type AssuranceLevel = 'aal1' | 'aal2';
export type MfaFactorType = 'totp' | 'phone';

export interface VerifiedMfaFactor {
  id: string;
  factor_type: MfaFactorType;
  status: string;
}

export interface MfaAssuranceDecision {
  verified: boolean;
  requiresChallenge: boolean;
  requiresEnrollment: boolean;
  factor: VerifiedMfaFactor | null;
}

export function resolveMfaAssurance(input: {
  requiresMfa: boolean;
  currentLevel: string | null;
  nextLevel: string | null;
  factors: VerifiedMfaFactor[];
}): MfaAssuranceDecision {
  const factor =
    input.factors.find(
      (candidate) =>
        candidate.status === 'verified' && candidate.factor_type === 'totp',
    ) ??
    input.factors.find(
      (candidate) =>
        candidate.status === 'verified' && candidate.factor_type === 'phone',
    ) ??
    null;

  if (input.currentLevel === 'aal2') {
    return {
      verified: true,
      requiresChallenge: false,
      requiresEnrollment: false,
      factor,
    };
  }

  if (input.currentLevel === 'aal1' && input.nextLevel === 'aal2') {
    if (!factor) {
      return {
        verified: false,
        requiresChallenge: false,
        requiresEnrollment: true,
        factor: null,
      };
    }
    return {
      verified: false,
      requiresChallenge: true,
      requiresEnrollment: false,
      factor,
    };
  }

  if (!input.requiresMfa) {
    return {
      verified: true,
      requiresChallenge: false,
      requiresEnrollment: false,
      factor,
    };
  }

  return {
    verified: false,
    requiresChallenge: false,
    requiresEnrollment: !factor,
    factor,
  };
}
