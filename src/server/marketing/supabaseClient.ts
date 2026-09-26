/**
 * Supabase Client Factory for RentMaikar Marketing Engine
 * Provides resilient client access for database state, auth, and webhook audit.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://jrsydiofzceoeddjogov.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_uE7DPlUSNxgQ1pfEA6nfQA_Z0VDAP4p';

let cachedClient: SupabaseClient | null = null;

export function getSupabase(token?: string): SupabaseClient {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
  const url = rawUrl && !rawUrl.includes('bwvocmhcledbwqlpcswp')
    ? rawUrl.replace(/\/+$/, '')
    : DEFAULT_SUPABASE_URL;

  const rawKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_KEY;

  if (token) {
    return createClient(url, rawKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  if (!cachedClient) {
    cachedClient = createClient(url, rawKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cachedClient;
}
