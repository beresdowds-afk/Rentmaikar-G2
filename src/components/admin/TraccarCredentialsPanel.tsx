import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, KeyRound, PlugZap, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { friendlySecretError, secretErrorDescription } from "@/lib/secret-errors";
import { useCredentialVerification } from "@/hooks/useCredentialVerification";

export interface TraccarDiagnosis {
  code: string;
  title: string;
  detail: string;
  hints: string[];
  status?: number;
  latency_ms?: number;
}

interface TestResult {
  configured?: boolean;
  base_url?: string | null;
  auth_mode?: string;
  latency_ms?: number;
  ping?: { ok?: boolean; body?: { name?: string; version?: string } };
  diagnosis?: TraccarDiagnosis;
}

interface Version {
  id: string;
  masked: Record<string, string>;
  status: string;
  created_at: string;
}

const FIELDS: Array<{ key: string; label: string; secret: boolean; placeholder: string }> = [
  { key: "base_url", label: "Server base URL", secret: false, placeholder: "https://traccar.example.com" },
  { key: "email", label: "Tracker email", secret: false, placeholder: "fleet@rentmaikar.com" },
  { key: "password", label: "Tracker password", secret: true, placeholder: "Leave blank to keep current" },
  { key: "token", label: "API token (optional, overrides email/password)", secret: true, placeholder: "Leave blank to keep current" },
];

/**
 * Traccar credentials settings — writes tracker email/password (and base URL /
 * API token) to the encrypted backend credential store, then re-tests the
 * connection and surfaces a precise failure reason.
 */
export function TraccarCredentialsPanel() {
  const [values, setValues] = useState<Record<string, string>>({});
  const { verifyAfterSave } = useCredentialVerification();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);

  const loadVersions = useCallback(async () => {
    const { data } = await supabase
      .from("provider_credential_versions" as never)
      .select("id, masked, status, created_at")
      .eq("provider", "traccar")
      .order("created_at", { ascending: false })
      .limit(10);
    setVersions((data as unknown as Version[]) || []);
  }, []);

  const test = useCallback(async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("traccar-admin", {
        body: { action: "test_connection" },
      });
      setCheckedAt(new Date().toISOString());
      if (error) {
        setResult({
          diagnosis: {
            code: "invoke_failed",
            title: "Could not reach the Traccar service",
            detail: error.message,
            hints: ["Confirm you are signed in as an admin or IoT support user, then retry."],
          },
        });
        return;
      }
      setResult(data as TestResult);
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => { loadVersions(); test(); }, [loadVersions, test]);

  const save = async () => {
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v && v.trim().length > 0).map(([k, v]) => [k, v.trim()]),
    );
    if (Object.keys(payload).length === 0) {
      toast.error("Enter at least one value to save");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("provider_write_credentials" as never, {
        _provider: "traccar",
        _values: payload,
        _notes: "Updated from Traccar credentials settings",
      } as never);
      if (error) throw error;
      toast.success("Traccar credentials saved securely — verifying…");
      setValues({});
      await loadVersions();
      // Verify the new credentials immediately and toast the real outcome.
      await verifyAfterSave("traccar");
      await test();
    } catch (e) {
      const friendly = friendlySecretError(e, "Traccar");
      toast.error(friendly.title, { description: secretErrorDescription(friendly), duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  const ok = result?.ping?.ok === true;
  const notConfigured = result?.configured === false;
  const dg = result?.diagnosis;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> Traccar credentials
            </CardTitle>
            <CardDescription>
              Update the tracker account email and password (or an API token). Values are stored
              encrypted in the backend secret store — never in code — and picked up by every sync
              job within a minute.
            </CardDescription>
          </div>
          {ok ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
          ) : notConfigured ? (
            <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3 w-3" /> Not configured</Badge>
          ) : result ? (
            <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`traccar-${f.key}`}>{f.label}</Label>
                <Input
                  id={`traccar-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Save credentials
            </Button>
            <Button size="sm" variant="outline" onClick={test} disabled={testing} className="gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Test connection
            </Button>
          </div>

          {dg && (
            <Alert variant={ok ? "default" : "destructive"}>
              {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <AlertTitle>{dg.title}</AlertTitle>
              <AlertDescription className="space-y-2 text-sm">
                <div className="whitespace-pre-wrap break-words">{dg.detail}</div>
                <div className="text-xs text-muted-foreground">
                  {result?.base_url ? <>Base URL: <code>{result.base_url}</code> · </> : null}
                  {result?.auth_mode ? <>Auth: {result.auth_mode} · </> : null}
                  {result?.ping?.body?.version ? <>Server v{result.ping.body.version} · </> : null}
                  {typeof dg.latency_ms === "number" ? <>{dg.latency_ms}ms · </> : null}
                  {dg.status ? <>HTTP {dg.status} · </> : null}
                  code: <code>{dg.code}</code>
                  {checkedAt ? <> · checked {new Date(checkedAt).toLocaleTimeString()}</> : null}
                </div>
                {dg.hints?.length > 0 && (
                  <ul className="list-disc pl-5">
                    {dg.hints.map((h) => <li key={h}>{h}</li>)}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Rotation history</CardTitle>
          <CardDescription>Only masked previews of stored values are ever readable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin-managed credentials yet — deployed backend secrets are in use.
            </p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <span className="text-muted-foreground">
                  {Object.entries(v.masked || {}).map(([k, m]) => `${k}: ${m}`).join(" · ")}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{v.status}</Badge>
                  {new Date(v.created_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TraccarCredentialsPanel;
