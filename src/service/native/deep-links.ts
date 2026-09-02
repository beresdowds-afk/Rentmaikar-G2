import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { installOnboardingDeepLinkListener } from "@/lib/onboarding-deep-link";
import { reportError } from "@/lib/error-monitor";

// Native deep-link bridge.
// Runs only on Capacitor (Android/iOS) and never blocks or crashes
// application startup if deep-link initialization fails.
const NativeDeepLinkBridge = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Web builds do not require native deep-link listeners.
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const initialiseDeepLinks = async () => {
      try {
        cleanup = await installOnboardingDeepLinkListener((path: string) => {
          if (disposed) return;

          // Ignore malformed deep links.
          if (typeof path !== "string") return;

          const target = path.trim();

          // Only allow internal application routes.
          if (!target.startsWith("/")) {
            console.warn("Ignoring invalid deep-link:", target);
            return;
          }

          try {
            navigate(target);
          } catch (navigationError) {
            reportError(
              navigationError as Error,
              "medium",
              "NativeDeepLinkBridge.navigate",
              { target }
            );
          }
        });
      } catch (error) {
        reportError(
          error as Error,
          "medium",
          "NativeDeepLinkBridge.initialisation"
        );

        // Never allow deep-link failures to crash the app.
        console.error("Deep-link listener failed to initialise.", error);
      }
    };

    void initialiseDeepLinks();

    return () => {
      disposed = true;

      try {
        if (typeof cleanup === "function") {
          cleanup();
        }
      } catch (error) {
        reportError(
          error as Error,
          "medium",
          "NativeDeepLinkBridge.cleanup"
        );
      }
    };
  }, [navigate]);

  return null;
};

export default NativeDeepLinkBridge;
