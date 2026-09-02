import { supabase } from "@/integrations/supabase/client";

const SW_PATH = "/push-sw.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

async function getVapidPublicKey(): Promise<string | null> {
  const { data } = await supabase.functions.invoke("get-vapid-public-key");
  return (data as any)?.publicKey ?? null;
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH, { scope: "/" });
}

export async function enablePushNotifications(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!isPushSupported()) return { ok: false, reason: "Push not supported in this browser" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permission denied" };

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return { ok: false, reason: "Push not configured (missing VAPID keys)" };

  const reg = await registerWorker();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyBytes = urlBase64ToUint8Array(publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer,
    });
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.functions.invoke("save-push-subscription", {
    body: {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    },
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.functions.invoke("save-push-subscription", {
      body: { endpoint: sub.endpoint, remove: true },
    });
    await sub.unsubscribe();
  }
}

/**
 * Listen for notificationclick messages posted by the SW to open the
 * native custom scheme (rentmaikar://…) in addition to routing in-app.
 */
export function installDeepLinkListener(navigate: (path: string) => void) {
  if (!isPushSupported()) return () => {};
  const handler = (evt: MessageEvent) => {
    const data = evt.data as { type?: string; deepLink?: string; url?: string } | undefined;
    if (!data || data.type !== "rentmaikar-deep-link") return;
    if (data.deepLink) {
      // Attempt to open native app via custom scheme; browser silently ignores if unregistered.
      try {
        const a = document.createElement("a");
        a.href = data.deepLink;
        a.rel = "noreferrer";
        a.click();
      } catch { /* ignore */ }
    }
    if (data.url) navigate(data.url);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
