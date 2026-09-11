import { useState, useEffect, useCallback } from 'react';
import { useRegion } from '@/contexts/RegionContext';
import {
  getSyncedDisruptionPolicy,
  saveSyncedDisruptionPolicy,
  type SyncedDisruptionPolicy,
} from '@/lib/onboarding-sync';

export function useSyncedDisruptionPolicy(customRegion?: 'USA' | 'Nigeria') {
  const { country } = useRegion();
  const effectiveRegion: 'USA' | 'Nigeria' = customRegion || (country === 'Nigeria' ? 'Nigeria' : 'USA');

  const [policy, setPolicy] = useState<SyncedDisruptionPolicy>(() =>
    getSyncedDisruptionPolicy(effectiveRegion)
  );

  useEffect(() => {
    setPolicy(getSyncedDisruptionPolicy(effectiveRegion));

    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent<SyncedDisruptionPolicy>).detail;
      if (!detail || detail.region === effectiveRegion || detail.region === 'All') {
        setPolicy(getSyncedDisruptionPolicy(effectiveRegion));
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'rentmaikar_synced_service_disruption_policy') {
        setPolicy(getSyncedDisruptionPolicy(effectiveRegion));
      }
    };

    window.addEventListener('rentmaikar:service-disruption-policy-synced', handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('rentmaikar:service-disruption-policy-synced', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [effectiveRegion]);

  const syncPolicy = useCallback(
    (newPolicy: Partial<SyncedDisruptionPolicy> & { version: string; rawClauseText: string }) => {
      const updated = saveSyncedDisruptionPolicy(effectiveRegion, newPolicy);
      setPolicy(updated);
      return updated;
    },
    [effectiveRegion]
  );

  return {
    policy,
    region: effectiveRegion,
    syncPolicy,
  };
}
