import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle, FlaskConical, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

/**
 * Admin-only payment provider settings.
 *
 * Credentials are written into the vault-backed provider credential store
 * (`provider_write_credentials`) so they take effect without a redeploy; the
 * non-secret sandbox/live switch lives in `platform_kv_settings`. Every save
 * immediately re-runs the configuration probe (`get-psp-config`) so the page
 * shows what the checkout functions will actually use.
 */

type Mode = "sandbox" | "live";

interface PspStatus {
  opay: {
    configured: boolean;
    merchantId: string;
    publicKey: string;
    environment: Mode;
    testMode: boolean;
    baseUrl: string;
    source: "admin" | "env" | "none";
    missing: string[];
  };
  paypal: {
    configured: boolean;
    clientId: string;
    mode: Mode;
    testMode: boolean;
    baseUrl: string;
    webhookConfigured: boolean;
  };
  checkedAt: string;
}

const OPAY_FIELDS: Array<{ key: string; label: string; secret: boolean }> = [
  { key: "merchant_id", label: "OPAY_MERCHANT_ID", secret: false },
  { key: "public_key", label: "OPAY_PUBLIC_KEY", secret: true },
  { key: "secret_key", label: "OPAY_SECRET_KEY", secret: true },
];

function ModeBadge({ mode }: { mode: Mode }) {
  return mode === "live" ? (
    <Badge variant="destructive">LIVE — real money</Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <FlaskConical className="h-3 w-3" aria-hidden="true" /> TEST / SANDBOX
    </Badge>
  );
}

export default function PaymentProviderSettingsPage() {
  const [status, setStatus] = useState<PspStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [opayMode, setOpayMode] = useState<Mode>("sandbox");
  const [paypalMode, setPaypalMode] = useState<Mode>("sandbox");
  const [savingMode, setSavingMode] = useState<"opay" | "paypal" | null>(null);

  const recheck = useCallback(async (quiet = false) => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-psp-config");
      if (error) throw new Error(error.message);
      const s = data as PspStatus;
      setStatus(s);
      setOpayMode(s.opay.environment);
      setPaypalMode(s.paypal.mode);
      if (!quiet) toast.success("Configuration rechecked");
    } catch (e) {
      toast.error("Could not read payment configuration", { description: (e as Error).message });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    recheck(true);
  }, [recheck]);

  const saveCredentials = async () => {
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v && v.trim().length > 0).map(([k, v]) => [k, v.trim()]),
    );
    if (Object.keys(payload).length === 0) {
      toast.error("Enter at least one value");
      return;
    }
    setSavingCreds(true);
    try {
      const { error } = await supabase.rpc("provider_write_credentials" as never, {
        _provider: "opay",
        _values: payload,
        _notes: `Saved from admin payment settings (${opayMode})`,
      } as never);
      if (error) throw error;
      setValues({});
      toast.success("Opay credentials saved — rechecking…");
      await recheck(true);
    } catch (e) {
      toast.error("Could not save Opay credentials", { description: (e as Error).message });
    } finally {
      setSavingCreds(false);
    }
  };

  const saveMode = async (provider: "opay" | "paypal", mode: Mode) => {
    setSavingMode(provider);
    try {
      const key = provider === "opay" ? "opay_config" : "paypal_config";
      const { data: existing } = await supabase
        .from("platform_kv_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      const current = (existing?.value ?? {}) as Record<string, unknown>;
      const value = provider === "opay" ? { ...current, environment: mode } : { ...current, mode };
      const { error } = await supabase
        .from("platform_kv_settings")
        .upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
      toast.success(
        `${provider === "opay" ? "Opay" : "PayPal"} switched to ${mode === "live" ? "LIVE" : "TEST (sandbox)"}`,
      );
      await recheck(true);
    } catch (e) {
      toast.error("Could not change payment mode", { description: (e as Error).message });
      await recheck(true);
    } finally {
      setSavingMode(null);
    }
  };

  const anyLive = status && (!status.opay.testMode || !status.paypal.testMode);

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Seo
        title="Payment provider settings | Rentmaikar admin"
        description="Manage Opay credentials and switch Opay and PayPal between test and live payment modes."
        path="/admin/payment-settings"
        noindex
      />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Payment provider settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage Opay credentials and switch Opay and PayPal between test (sandbox) and live modes.
          Changes apply to the checkout and webhook functions within a minute — no redeploy.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => recheck()} disabled={checking}>
          <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
          {checking ? "Rechecking…" : "Recheck configuration"}
        </Button>
        {status && (
          <span className="text-xs text-muted-foreground">
            Last checked {new Date(status.checkedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {anyLive && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Live mode is active</AlertTitle>
          <AlertDescription>
            At least one provider is in LIVE mode — checkouts will move real money. Switch to test
            mode before running end-to-end checkout or webhook verification.
          </AlertDescription>
        </Alert>
      )}

      {/* ------------------------------- Opay ------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Opay (Nigeria)
            {status && <ModeBadge mode={status.opay.environment} />}
            <Badge variant={status?.opay.configured ? "default" : "outline"}>
              {status?.opay.configured ? "Configured" : "Not configured"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {status?.opay.configured
              ? `Merchant ${status.opay.merchantId} · ${status.opay.baseUrl} · source: ${
                  status.opay.source === "admin" ? "saved here" : "deployed secret"
                }`
              : "Enter the credentials from your Opay merchant dashboard. Values are stored encrypted and never readable again."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && status.opay.missing.length > 0 && (
            <p className="text-sm text-destructive">Missing: {status.opay.missing.join(", ")}</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {OPAY_FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`opay-${f.key}`}>{f.label}</Label>
                <Input
                  id={`opay-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder="Leave blank to keep current"
                />
              </div>
            ))}
          </div>
          <Button size="sm" onClick={saveCredentials} disabled={savingCreds}>
            {savingCreds ? "Saving & rechecking…" : "Save & recheck"}
          </Button>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="opay-mode" className="flex items-center gap-2">
                Opay test (sandbox) mode
              </Label>
              <p className="text-xs text-muted-foreground">
                On = sandboxapi.opaycheckout.com, no real money. Off = live production transactions.
              </p>
            </div>
            <Switch
              id="opay-mode"
              checked={opayMode === "sandbox"}
              disabled={savingMode === "opay"}
              onCheckedChange={(checked) => {
                const next: Mode = checked ? "sandbox" : "live";
                setOpayMode(next);
                saveMode("opay", next);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------ PayPal ------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            PayPal (USA)
            {status && <ModeBadge mode={status.paypal.mode} />}
            <Badge variant={status?.paypal.configured ? "default" : "outline"}>
              {status?.paypal.configured ? "Configured" : "Not configured"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {status?.paypal.configured
              ? `${status.paypal.baseUrl}${status.paypal.webhookConfigured ? "" : " · webhook ID not set — webhook signatures cannot be verified"}`
              : "PayPal client ID/secret are not set."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="paypal-mode">PayPal test (sandbox) mode</Label>
              <p className="text-xs text-muted-foreground">
                On = api-m.sandbox.paypal.com, safe for end-to-end checkout and webhook tests.
                Off = live production transactions.
              </p>
            </div>
            <Switch
              id="paypal-mode"
              checked={paypalMode === "sandbox"}
              disabled={savingMode === "paypal"}
              onCheckedChange={(checked) => {
                const next: Mode = checked ? "sandbox" : "live";
                setPaypalMode(next);
                saveMode("paypal", next);
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
