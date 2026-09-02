import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Cookie, X, Shield, BarChart3, Megaphone, Sliders } from "lucide-react";
import { Link } from "react-router-dom";
import {
  useCookieConsent,
  type CookieCategory,
  type CookiePreferences,
  DEFAULT_PREFS,
} from "@/hooks/useCookieConsent";

const CATEGORIES: Array<{
  key: CookieCategory;
  title: string;
  description: string;
  icon: React.ElementType;
  required?: boolean;
}> = [
  {
    key: "necessary",
    title: "Strictly Necessary",
    description: "Required for authentication, security, and core platform functionality. Always active.",
    icon: Shield,
    required: true,
  },
  {
    key: "analytics",
    title: "Analytics",
    description: "Help us understand traffic, page performance, and how features are used.",
    icon: BarChart3,
  },
  {
    key: "marketing",
    title: "Marketing",
    description: "Personalize offers and measure campaign effectiveness across channels.",
    icon: Megaphone,
  },
  {
    key: "preferences",
    title: "Preferences",
    description: "Remember your region, language, and saved UI settings between visits.",
    icon: Sliders,
  },
];

const CookieConsent = () => {
  const { consent, hasConsented, update, acceptAll, rejectAll } = useCookieConsent();
  const [bannerVisible, setBannerVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<CookiePreferences>(consent ?? DEFAULT_PREFS);

  useEffect(() => {
    if (!hasConsented) {
      const t = setTimeout(() => setBannerVisible(true), 1500);
      return () => clearTimeout(t);
    }
    setBannerVisible(false);
  }, [hasConsented]);

  useEffect(() => {
    setDraft(consent);
  }, [consent, sheetOpen]);

  useEffect(() => {
    const open = () => setSheetOpen(true);
    window.addEventListener("cookie-consent-open", open);
    return () => window.removeEventListener("cookie-consent-open", open);
  }, []);

  const handleAcceptAll = () => {
    acceptAll();
    setBannerVisible(false);
    setSheetOpen(false);
  };

  const handleRejectAll = () => {
    rejectAll();
    setBannerVisible(false);
    setSheetOpen(false);
  };

  const handleSavePrefs = () => {
    update(draft);
    setBannerVisible(false);
    setSheetOpen(false);
  };

  return (
    <>
      {bannerVisible && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slide-up">
          <div className="container mx-auto max-w-4xl">
            <div className="relative bg-card border border-border rounded-xl shadow-lg p-4 md:p-6">
              <button
                onClick={handleRejectAll}
                className="absolute top-3 right-3 p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss and reject non-essential cookies"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <Cookie className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Your cookie preferences</p>
                    <p className="text-sm text-muted-foreground">
                      We use cookies to keep the platform secure, measure performance, and personalise your
                      experience. Choose what you're comfortable with — you can change this any time. See our{" "}
                      <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)} className="flex-1 md:flex-none">
                    Customize
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRejectAll} className="flex-1 md:flex-none">
                    Reject non-essential
                  </Button>
                  <Button size="sm" onClick={handleAcceptAll} className="flex-1 md:flex-none">
                    Accept all
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Cookie className="w-5 h-5 text-primary" />
              Cookie preferences
            </SheetTitle>
            <SheetDescription>
              Choose which categories of cookies you allow. Necessary cookies are always on.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 py-4">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <div key={cat.key} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Icon className="w-4 h-4 mt-0.5 text-primary" />
                      <div>
                        <div className="text-sm font-medium">{cat.title}</div>
                        <p className="text-xs text-muted-foreground">{cat.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={cat.required ? true : draft[cat.key]}
                      disabled={cat.required}
                      onCheckedChange={val => setDraft(d => ({ ...d, [cat.key]: val }))}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <SheetFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleRejectAll} className="w-full sm:w-auto">Reject non-essential</Button>
            <Button variant="outline" onClick={handleAcceptAll} className="w-full sm:w-auto">Accept all</Button>
            <Button onClick={handleSavePrefs} className="w-full sm:w-auto">Save preferences</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default CookieConsent;
