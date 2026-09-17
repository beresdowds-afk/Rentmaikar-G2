// Storage adapter for Supabase client auth session persistence
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

