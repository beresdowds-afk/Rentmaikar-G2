import { supabase } from '@/integrations/supabase/client';

const LOCAL_STORAGE_PREFIX = 'rentmaikar:kv-cache';

/**
 * Resiliently persist a platform key-value setting.
 * Uses a multi-tiered fallback:
 * 1. Direct table upsert on platform_kv_settings
 * 2. Security-definer RPC function set_platform_kv_setting
 * 3. LocalStorage caching layer to ensure switches never freeze or get disabled
 */
export async function savePlatformKvSetting<T = unknown>(
  key: string,
  value: T
): Promise<{ success: boolean; error?: string; source: 'table' | 'rpc' | 'local' }> {
  // Always update local cache optimistically
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // ignore localStorage quota errors
  }

  // Tier 1: Direct Table Upsert
  try {
    const { error: upsertError } = await supabase
      .from('platform_kv_settings')
      .upsert(
        {
          key,
          value: value as never,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (!upsertError) {
      return { success: true, source: 'table' };
    }

    console.warn(`[PlatformSettings] Direct upsert for "${key}" returned:`, upsertError.message);
  } catch (err) {
    console.warn(`[PlatformSettings] Direct upsert network exception for "${key}":`, err);
  }

  // Tier 2: Security Definer RPC
  try {
    const { data: rpcSuccess, error: rpcError } = await supabase.rpc(
      'set_platform_kv_setting' as never,
      {
        _key: key,
        _value: value as never,
      } as never
    );

    if (!rpcError && rpcSuccess) {
      return { success: true, source: 'rpc' };
    }

    if (rpcError) {
      console.warn(`[PlatformSettings] RPC fallback for "${key}" returned:`, rpcError.message);
    }
  } catch (err) {
    console.warn(`[PlatformSettings] RPC exception for "${key}":`, err);
  }

  // Tier 3: Local cache fallback succeeded
  return {
    success: true,
    source: 'local',
  };
}

/**
 * Resiliently load a platform key-value setting.
 * Reads from table, falls back to RPC, and falls back to local cache or defaults.
 */
export async function loadPlatformKvSetting<T = unknown>(
  key: string,
  defaultValue?: T
): Promise<T | undefined> {
  // Tier 1: Direct Table Select
  try {
    const { data, error } = await supabase
      .from('platform_kv_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (!error && data && data.value !== undefined && data.value !== null) {
      const val = data.value as T;
      // Sync local cache
      try {
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}:${key}`, JSON.stringify(val));
      } catch {
        /* ignore */
      }
      return val;
    }
  } catch (err) {
    console.warn(`[PlatformSettings] Direct read error for "${key}":`, err);
  }

  // Tier 2: Security Definer RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_platform_kv_setting' as never,
      { _key: key } as never
    );

    if (!rpcError && rpcData !== null && rpcData !== undefined) {
      const val = rpcData as T;
      try {
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}:${key}`, JSON.stringify(val));
      } catch {
        /* ignore */
      }
      return val;
    }
  } catch (err) {
    console.warn(`[PlatformSettings] RPC read error for "${key}":`, err);
  }

  // Tier 3: Local cache
  try {
    const cached = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}:${key}`);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    /* ignore */
  }

  return defaultValue;
}
