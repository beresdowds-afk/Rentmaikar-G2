import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { type PortalType } from '@/components/admin/PortalNavigation';
import { getDefaultTabForPortal, getPortalForTab, PORTAL_TABS } from '@/lib/admin-tab-registry';

const STORAGE_PREFIX = 'rentmaikar:decoupled-portal';

function normalizePortal(raw: string | null): PortalType {
  if (!raw) return 'support';
  if (raw === 'content') return 'content-editor';
  if (['crm', 'erp', 'support', 'content-editor', 'marketing', 'docs'].includes(raw)) {
    return raw as PortalType;
  }
  return 'support';
}

function getInitialTabs(scope: string): Record<string, string> {
  const defaults: Record<string, string> = {
    crm: 'applications',
    erp: 'tracking',
    support: 'task-portal',
    'content-editor': 'faq',
    content: 'faq',
    marketing: 'campaigns',
    docs: 'platform-features',
  };

  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}:${scope}:tabs`);
    if (stored) {
      return { ...defaults, ...JSON.parse(stored) };
    }
  } catch {
    /* ignore storage access error */
  }
  return defaults;
}

/**
 * Isolated portal and tab manager that completely severs inter-sibling state interference
 * between CRM, ERP, SUPPORT, CONTENT EDITOR, MARKETING, and DOCS.
 *
 * Each portal maintains its own remembered active tab independently.
 * Switching between portals never clobbers or contaminates sibling state.
 */
export function useDecoupledAdminPortal(
  defaultPortal: PortalType = 'support',
  defaultTab?: string,
  scope: string = 'admin',
) {
  const location = useLocation();
  const navigate = useNavigate();

  // Remembered active tabs per portal
  const [tabByPortal, setTabByPortal] = useState<Record<string, string>>(() => getInitialTabs(scope));

  // Determine initial portal and tab from URL or defaults
  const readUrlState = useCallback(() => {
    const params = new URLSearchParams(location.search);
    const rawPortal = params.get('portal');
    const rawTab = params.get('tab');

    const portal = normalizePortal(rawPortal || defaultPortal);
    const portalTabs = PORTAL_TABS[portal] || [];
    const isValidTabForPortal = rawTab && portalTabs.some((t) => t.value === rawTab);

    let tab = rawTab;
    if (!isValidTabForPortal) {
      // Use remembered tab for this portal or default
      tab = tabByPortal[portal] || defaultTab || getDefaultTabForPortal(portal);
    }

    return { portal, tab };
  }, [location.search, defaultPortal, defaultTab, tabByPortal]);

  const initialState = readUrlState();
  const [portalView, setPortalViewState] = useState<PortalType>(initialState.portal);
  const [activeTab, setActiveTabState] = useState<string>(initialState.tab);

  // Sync state when location.search changes (browser back/forward button or external navigation)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlPortalRaw = params.get('portal');
    const urlTab = params.get('tab');

    if (!urlPortalRaw && !urlTab) {
      // Initialize URL with current state if completely empty
      const targetPortal = portalView;
      const targetTab = activeTab;
      params.set('portal', targetPortal);
      params.set('tab', targetTab);
      navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, { replace: true });
      return;
    }

    const urlPortal = normalizePortal(urlPortalRaw);
    const portalTabs = PORTAL_TABS[urlPortal] || [];
    const isValidTab = urlTab && portalTabs.some((t) => t.value === urlTab);
    const resolvedTab = isValidTab ? urlTab : (tabByPortal[urlPortal] || getDefaultTabForPortal(urlPortal));

    if (urlPortal !== portalView) {
      setPortalViewState(urlPortal);
    }
    if (resolvedTab !== activeTab) {
      setActiveTabState(resolvedTab);
    }

    // Persist remembered tab
    setTabByPortal((prev) => {
      if (prev[urlPortal] === resolvedTab) return prev;
      const next = { ...prev, [urlPortal]: resolvedTab };
      try {
        localStorage.setItem(`${STORAGE_PREFIX}:${scope}:tabs`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [location.search, portalView, activeTab, tabByPortal, location.pathname, location.hash, navigate, scope]);

  // Navigate to a specific portal and tab atomically
  const navigateTo = useCallback(
    (targetPortalRaw: PortalType, targetTab?: string) => {
      const targetPortal = normalizePortal(targetPortalRaw);
      const resolvedTab = targetTab || tabByPortal[targetPortal] || getDefaultTabForPortal(targetPortal);

      setPortalViewState(targetPortal);
      setActiveTabState(resolvedTab);

      // Remember per-portal tab
      setTabByPortal((prev) => {
        const next = { ...prev, [targetPortal]: resolvedTab };
        try {
          localStorage.setItem(`${STORAGE_PREFIX}:${scope}:tabs`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });

      const params = new URLSearchParams(location.search);
      params.set('portal', targetPortal);
      params.set('tab', resolvedTab);

      navigate(
        { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
        { replace: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate, scope, tabByPortal],
  );

  // Switch portal without corrupting any sibling state
  const setPortalView = useCallback(
    (newPortal: PortalType) => {
      navigateTo(newPortal);
    },
    [navigateTo],
  );

  // Switch tab within the active portal or switch portal if tab belongs elsewhere
  const setActiveTab = useCallback(
    (newTab: string) => {
      const owningPortal = getPortalForTab(newTab);
      const targetPortal = owningPortal || portalView;
      navigateTo(targetPortal, newTab);
    },
    [navigateTo, portalView],
  );

  return {
    portalView,
    activeTab,
    setPortalView,
    setActiveTab,
    navigateTo,
  };
}
