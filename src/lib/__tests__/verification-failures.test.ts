import { describe, it, expect } from 'vitest';
import {
  classifyVerificationFailure,
  classifyPersonaMismatches,
  isTransient,
  FAILURE_CATALOGUE,
} from '../verification-failures';

describe('classifyVerificationFailure', () => {
  it('never returns a bare "verification failed" message', () => {
    for (const def of Object.values(FAILURE_CATALOGUE)) {
      expect(def.message.length).toBeGreaterThan(20);
      expect(def.nextStep.length).toBeGreaterThan(10);
      expect(def.title.toLowerCase()).not.toBe('verification failed');
    }
  });

  it('maps blurry document checks to a re-upload action', () => {
    const f = classifyVerificationFailure('government_id_blur_detection');
    expect(f.code).toBe('document_blurry');
    expect(f.action).toBe('reupload_document');
    expect(f.retryable).toBe(true);
  });

  it('maps selfie/ID face mismatch to a terminal retake', () => {
    const f = classifyVerificationFailure('selfie_comparison failed');
    expect(f.code).toBe('face_mismatch');
    expect(f.retryable).toBe(false);
  });

  it('maps camera permission errors from the browser', () => {
    const err = new DOMException('Permission denied', 'NotAllowedError');
    expect(classifyVerificationFailure(err).code).toBe('camera_permission_denied');
  });

  it('maps Supabase RLS denial', () => {
    expect(classifyVerificationFailure({ code: '42501', message: 'permission denied for table x' }).code)
      .toBe('db_permission');
  });

  it('maps Google OAuth redirect mismatch', () => {
    expect(classifyVerificationFailure({ error: 'redirect_uri_mismatch' }).code).toBe('oauth_redirect_mismatch');
  });

  it('maps unsupported provider to provider_not_enabled', () => {
    expect(classifyVerificationFailure({ message: 'Unsupported provider: provider is not enabled' }).code)
      .toBe('provider_not_enabled');
  });

  it('maps identity_already_exists to account linking', () => {
    const f = classifyVerificationFailure({ code: 'identity_already_exists' });
    expect(f.code).toBe('identity_already_linked');
    expect(f.action).toBe('contact_support');
  });

  it('maps handle_new_user trigger failures', () => {
    expect(classifyVerificationFailure('Database error saving new user').code).toBe('profile_creation_failed');
  });

  it('maps rate limiting as retryable', () => {
    const f = classifyVerificationFailure('429 Too Many Requests');
    expect(f.code).toBe('persona_rate_limited');
    expect(f.retryable).toBe(true);
  });

  it('maps sanctions hits to compliance review that blocks activation', () => {
    const f = classifyVerificationFailure('sanctions_screening watchlist hit');
    expect(f.domain).toBe('persona_compliance');
    expect(f.blocksActivation).toBe(true);
    expect(f.action).toBe('wait_for_review');
  });

  it('accepts a catalogue code directly', () => {
    expect(classifyVerificationFailure('blocker_payout_details_missing').code).toBe('blocker_payout_details_missing');
  });

  it('falls back to unknown_failure with the raw text retained', () => {
    const f = classifyVerificationFailure(new Error('kaboom ¯\\_(ツ)_/¯'));
    expect(f.code).toBe('unknown_failure');
    expect(f.raw).toContain('kaboom');
  });

  it('carries the correlation id through', () => {
    expect(classifyVerificationFailure('blur', { correlationId: 'cid-1' }).correlationId).toBe('cid-1');
  });
});

describe('classifyPersonaMismatches', () => {
  it('classifies every failing check and de-duplicates', () => {
    const out = classifyPersonaMismatches({
      government_id_blur_detection: { status: 'failed' },
      id_blur_check: { status: 'failed' },
      selfie_liveness: { status: 'failed' },
      _decision_reason: 'manual_review',
    });
    const codes = out.map((f) => f.code);
    expect(codes).toContain('document_blurry');
    expect(codes).toContain('liveness_failed');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('puts terminal issues before retryable fixes', () => {
    const out = classifyPersonaMismatches({
      government_id_blur_detection: { status: 'failed' },
      selfie_comparison: { status: 'failed' },
    });
    expect(out[0].retryable).toBe(false);
  });

  it('returns an empty list for a clean inquiry', () => {
    expect(classifyPersonaMismatches(null)).toEqual([]);
    expect(classifyPersonaMismatches({})).toEqual([]);
  });
});

describe('isTransient', () => {
  it('treats network + provider issues as auto-retryable', () => {
    expect(isTransient(FAILURE_CATALOGUE.persona_timeout)).toBe(true);
    expect(isTransient(FAILURE_CATALOGUE.network_error)).toBe(true);
  });
  it('never auto-retries user-action failures', () => {
    expect(isTransient(FAILURE_CATALOGUE.document_blurry)).toBe(false);
    expect(isTransient(FAILURE_CATALOGUE.face_mismatch)).toBe(false);
  });
});
