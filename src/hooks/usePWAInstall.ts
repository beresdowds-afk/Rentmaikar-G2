import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PWAInstallResult {
  outcome: 'accepted' | 'dismissed' | 'manual_instructions' | 'already_installed' | 'unsupported';
  success: boolean;
  message?: string;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [platformName, setPlatformName] = useState<string>('Device');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect device platform
    const ua = window.navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const android = /Android/i.test(ua);
    const mac = /Macintosh|Mac OS X/i.test(ua) && !ios;
    const windows = /Windows/i.test(ua);

    setIsIOS(ios);
    setIsAndroid(android);
    if (ios) setPlatformName('iPhone / iPad');
    else if (android) setPlatformName('Android');
    else if (mac) setPlatformName('Mac');
    else if (windows) setPlatformName('Windows PC');
    else setPlatformName('Device');

    // Check if already running in standalone mode (installed PWA)
    const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isAndroidApp = document.referrer.includes('android-app://');

    if (isStandaloneDisplay || isIOSStandalone || isAndroidApp) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      // If on iOS or unsupported browser, return false so caller can trigger manual modal
      return false;
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[PWA] Installation prompt failed or dismissed:', err);
      return false;
    }
  }, [deferredPrompt]);

  const triggerSelfInstallation = useCallback(async (): Promise<PWAInstallResult> => {
    if (isInstalled) {
      return { outcome: 'already_installed', success: true, message: 'App is already installed on this device.' };
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setIsInstallable(false);
          return { outcome: 'accepted', success: true, message: 'Installation accepted!' };
        }
        return { outcome: 'dismissed', success: false, message: 'Installation was postponed.' };
      } catch (err: any) {
        return { outcome: 'unsupported', success: false, message: err.message };
      }
    }

    if (isIOS) {
      return { outcome: 'manual_instructions', success: false, message: 'iOS requires manual Add to Home Screen.' };
    }

    return { outcome: 'unsupported', success: false, message: 'Use browser installation options or shortcut.' };
  }, [deferredPrompt, isInstalled, isIOS]);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    platformName,
    deferredPrompt,
    install,
    triggerSelfInstallation,
  };
}
