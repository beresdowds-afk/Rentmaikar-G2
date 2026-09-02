import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

/**
 * Registers the device for native push notifications (iOS/Android) and stores
 * the token in `push_devices` so the backend can target it. Silently no-ops on
 * the web — web push is handled separately by the PWA messaging worker.
 *
 * Preferences (channels + per-event opt-outs) are stored on the same row and
 * the server-side push sender consults them before dispatching.
 */
export function useNativePush(options?: { requestPermission?: boolean }) {
  const requestPermission = options?.requestPermission ?? false;
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    if (!Capacitor.isNativePlatform()) return;
    registered.current = true;

    let cleanup: Array<() => void> = [];

    (async () => {
      try {
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== "granted") {
          // Permission prompts belong at the point of use (the "Enable alerts"
          // control), not at app start — stay passive unless asked.
          if (!requestPermission) return;
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;
        await PushNotifications.register();

        const l1 = await PushNotifications.addListener("registration", async ({ value }) => {
          const platform = Capacitor.getPlatform() as "ios" | "android";
          await supabase.rpc("register_push_device" as any, {
            _platform: platform,
            _token: value,
            _device_label: navigator.userAgent.slice(0, 120),
          });
        });
        const l2 = await PushNotifications.addListener("registrationError", (err) => {
          console.warn("[push] registration error", err);
        });
        const l3 = await PushNotifications.addListener("pushNotificationReceived", (n) => {
          console.info("[push] received", n.title);
        });

        cleanup = [() => l1.remove(), () => l2.remove(), () => l3.remove()];
      } catch (e) {
        console.warn("[push] setup failed", e);
      }
    })();

    return () => { cleanup.forEach((fn) => fn()); };
  }, [requestPermission]);
}

/**
 * Explicitly asks for native push permission and registers the device.
 * Call this from a user gesture (e.g. the "Enable alerts" button) so the OS
 * prompt appears at the point of use. No-ops on the web.
 */
export async function requestNativePushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return false;
    await PushNotifications.register();
    return true;
  } catch (e) {
    console.warn("[push] permission request failed", e);
    return false;
  }
}
