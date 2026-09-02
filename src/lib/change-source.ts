import { Capacitor } from '@capacitor/core';

export type ChangeSource = 'web' | 'ios' | 'android';

/** Best-effort platform identifier used when logging profile audit entries. */
export function getChangeSource(): ChangeSource {
  try {
    if (Capacitor?.isNativePlatform?.()) {
      const p = Capacitor.getPlatform?.();
      if (p === 'ios' || p === 'android') return p;
    }
  } catch {
    /* Capacitor not available in this runtime — treat as web */
  }
  return 'web';
}

/** True when running inside the iOS/Android WebView. */
export function isNativeApp(): boolean {
  try {
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}
