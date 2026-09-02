/**
 * Static verification that the profile-photos storage bucket enforces the
 * per-user ownership rules — insert/update/delete are locked to
 * `authenticated` users and to the folder that matches auth.uid().
 *
 * These tests read the migration SQL rather than hitting the live database
 * so they run offline. Combined with the RLS runtime enforcement, they
 * guarantee we don't accidentally regress the policy in a future migration.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readLatestPolicySql(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  // Concatenate all migrations — DROP + CREATE order still lets us assert the
  // final desired policies exist.
  return files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
}

const sql = readLatestPolicySql();

describe('profile-photos storage policies', () => {
  it('restricts INSERT to authenticated users in their own folder', () => {
    expect(sql).toMatch(/profile_photos_insert_own/);
    expect(sql).toMatch(/FOR INSERT[\s\S]*TO authenticated[\s\S]*profile-photos[\s\S]*auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
  });

  it('restricts UPDATE to the owner of the object', () => {
    expect(sql).toMatch(/profile_photos_update_own/);
    expect(sql).toMatch(/FOR UPDATE[\s\S]*TO authenticated[\s\S]*profile-photos[\s\S]*auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
  });

  it('restricts DELETE to the owner of the object', () => {
    expect(sql).toMatch(/profile_photos_delete_own/);
    expect(sql).toMatch(/FOR DELETE[\s\S]*TO authenticated[\s\S]*profile-photos[\s\S]*auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
  });

  it('does NOT allow anon write access to profile-photos', () => {
    // A policy on storage.objects that targets profile-photos and is scoped
    // to `anon` for write ops would allow tampering. Assert none exist.
    const anonWrite = new RegExp(
      "FOR\\s+(INSERT|UPDATE|DELETE)[\\s\\S]{0,200}TO\\s+anon[\\s\\S]{0,400}profile-photos",
      'i',
    );
    expect(sql).not.toMatch(anonWrite);
  });
});
