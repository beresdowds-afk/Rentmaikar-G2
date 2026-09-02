import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Keeps a tab selection in the URL (?tab=...) so a page refresh, a shared link,
 * or back/forward navigation restores the exact view the user was on.
 * Falls back to sessionStorage (scoped per route) when no param is present.
 */
export function usePersistedTab(defaultTab: string, paramKey = 'tab') {
  const location = useLocation();
  const navigate = useNavigate();
  const storageKey = `tab:${location.pathname}:${paramKey}`;

  const readInitial = () => {
    const fromUrl = new URLSearchParams(location.search).get(paramKey);
    if (fromUrl) return fromUrl;
    try {
      return sessionStorage.getItem(storageKey) || defaultTab;
    } catch {
      return defaultTab;
    }
  };

  const [tab, setTabState] = useState<string>(readInitial);

  // Keep state in sync when the URL changes (back/forward, in-app links).
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get(paramKey);
    if (fromUrl && fromUrl !== tab) setTabState(fromUrl);
  }, [location.search, paramKey, tab]);

  // Make sure the URL always reflects the active tab (including on first load).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get(paramKey) !== tab) {
      params.set(paramKey, tab);
      navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, { replace: true });
    }
    try {
      sessionStorage.setItem(storageKey, tab);
    } catch {
      /* storage unavailable — URL still carries the state */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const setTab = useCallback((next: string) => setTabState(next), []);

  return [tab, setTab] as const;
}
