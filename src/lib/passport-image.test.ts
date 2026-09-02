import { describe, it, expect } from 'vitest';
import { extractStoragePath, PASSPORT_ALLOWED_TYPES } from './passport-image';

describe('passport-image', () => {
  it('extracts a storage path from a public URL', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/profile-photos/user-1/passport-123.jpg';
    expect(extractStoragePath(url, 'profile-photos')).toBe('user-1/passport-123.jpg');
  });

  it('returns null for URLs from other buckets', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/vehicle-photos/foo.jpg';
    expect(extractStoragePath(url, 'profile-photos')).toBeNull();
  });

  it('rejects unsafe formats', () => {
    expect(PASSPORT_ALLOWED_TYPES).not.toContain('image/svg+xml');
    expect(PASSPORT_ALLOWED_TYPES).not.toContain('image/gif');
  });
});
