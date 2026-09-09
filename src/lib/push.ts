export function installDeepLinkListener(navigate: (path: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: MessageEvent) => {
    try {
      if (e.data?.type === 'NAVIGATE_DEEP_LINK' && e.data?.url) {
        navigate(e.data.url);
      }
    } catch {
      // Ignore malformed message
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export async function enablePushNotifications(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

export async function disablePushNotifications(): Promise<void> {
  // No-op for disabling push notifications locally
}
