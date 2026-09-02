import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermission,
  isPushSupported,
} from "@/lib/push";
import { requestNativePushPermission } from "@/hooks/useNativePush";

export function EnablePushButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isPushSupported());
    getPushPermission().then((p) => setEnabled(p === "granted"));
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setLoading(true);
    try {
      if (enabled) {
        await disablePushNotifications();
        setEnabled(false);
        toast.message("Payment alerts disabled");
      } else {
        await requestNativePushPermission();
        const res = await enablePushNotifications();
        if (res.ok) {
          setEnabled(true);
          toast.success("Payment alerts enabled");
        } else {
          toast.error("reason" in res ? res.reason : "Could not enable alerts");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={enabled ? "secondary" : "outline"} size="sm" onClick={toggle} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : enabled ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
      {enabled ? "Payment alerts on" : "Enable payment alerts"}
    </Button>
  );
}
