import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, PlugZap, CheckCircle2, XCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type TraccarValidationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "not_configured"; message: string }
  | { status: "ok"; baseUrl: string; serverName?: string }
  | { status: "error"; step: string; message: string; hints: string[] };

interface Props {
  onStateChange?: (s: TraccarValidationState) => void;
  autoRun?: boolean;
}

const HINTS_401 = [
  "Verify TRACCAR_TOKEN is a valid session token (or that TRACCAR_EMAIL + TRACCAR_PASSWORD are correct).",
  "Regenerate a session token from Traccar → Settings → Account → Tokens.",
];
const HINTS_404 = [
  "TRACCAR_BASE_URL must be the API root of your Traccar server (e.g. https://demo.traccar.org).",
  "Do NOT include a trailing /api — the client appends it automatically.",
];
const HINTS_NETWORK = [
  "Confirm the Traccar server is reachable from the internet (HTTPS strongly recommended).",
  "Check TRACCAR_BASE_URL DNS/SSL certificate; self-signed certs will fail.",
];
const HINTS_MISSING = [
  "Set TRACCAR_BASE_URL to your server URL (e.g. https://traccar.example.com).",
  "Set TRACCAR_TOKEN OR both TRACCAR_EMAIL and TRACCAR_PASSWORD.",
];

export default function TraccarSettingsPanel({ onStateChange, autoRun = true }: Props) {
  const [state, setState] = useState<TraccarValidationState>({ status: "idle" });
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const push = useCallback(
    (s: TraccarValidationState) => {
      setState(s);
      onStateChange?.(s);
    },
    [onStateChange],
  );

  const run = useCallback(async () => {
    push({ status: "checking" });
    try {
      const { data, error } = await supabase.functions.invoke("traccar-admin", {
        body: { action: "test_connection" },
      });
      setCheckedAt(new Date().toISOString());
      if (error) {
        push({
          status: "error",
          step: "invoke",
          message: error.message || "Edge function invocation failed",
          hints: HINTS_NETWORK,
        });
        return;
      }
      if (data?.configured === false) {
        push({
          status: "not_configured",
          message: data?.diagnosis?.detail
            ? `${data.diagnosis.title} — ${data.diagnosis.detail}`
            : data?.message ?? "Traccar credentials missing",
        });
        return;
      }
      const ping = data?.ping;
      const diagnosis = data?.diagnosis as
        | { code: string; title: string; detail: string; hints: string[]; status?: number }
        | undefined;
      if (ping?.ok) {
        push({
          status: "ok",
          baseUrl: data?.base_url ?? "(unknown)",
          serverName: ping.body?.name,
        });
        return;
      }
      if (diagnosis) {
        push({
          status: "error",
          step: diagnosis.code,
          message: `${diagnosis.title} — ${diagnosis.detail}`,
          hints: diagnosis.hints?.length ? diagnosis.hints : HINTS_NETWORK,
        });
        return;
      }
      const status: number | undefined = ping?.status;
      let hints = HINTS_NETWORK;
      if (status === 401 || status === 403) hints = HINTS_401;
      else if (status === 404) hints = HINTS_404;
      push({
        status: "error",
        step: `server_${status ?? "unknown"}`,
        message:
          typeof ping?.body === "string"
            ? ping.body
            : JSON.stringify(ping?.body ?? { reason: ping?.reason ?? "unknown" }),
        hints,
      });

    } catch (e: any) {
      setCheckedAt(new Date().toISOString());
      push({
        status: "error",
        step: "exception",
        message: e?.message ?? String(e),
        hints: HINTS_NETWORK,
      });
    }
  }, [push]);

  useEffect(() => {
    if (autoRun) run();
  }, [autoRun, run]);

  const Header = (
    <CardHeader className="flex flex-row items-start justify-between gap-2">
      <div>
        <CardTitle className="flex items-center gap-2">
          <PlugZap className="h-5 w-5" />
          Traccar Connection Validation
        </CardTitle>
        <CardDescription>
          Validates <code>TRACCAR_BASE_URL</code> and <code>TRACCAR_TOKEN</code> (or
          <code> TRACCAR_EMAIL</code> + <code>TRACCAR_PASSWORD</code>) against{" "}
          <code>/api/server</code>. The Live Map only enables after a successful check.
        </CardDescription>
      </div>
      <div className="flex items-center gap-2">
        {state.status === "ok" && (
          <Badge className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </Badge>
        )}
        {state.status === "not_configured" && (
          <Badge variant="secondary" className="gap-1">
            <ShieldAlert className="h-3 w-3" /> Not configured
          </Badge>
        )}
        {state.status === "error" && (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" /> Failed
          </Badge>
        )}
        <Button size="sm" variant="outline" onClick={run} disabled={state.status === "checking"}>
          {state.status === "checking" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>
    </CardHeader>
  );

  return (
    <Card>
      {Header}
      <CardContent className="space-y-3">
        {state.status === "ok" && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Connected to {state.serverName ?? "Traccar"}</AlertTitle>
            <AlertDescription>
              Base URL: <code>{state.baseUrl}</code>
              {checkedAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  Verified {new Date(checkedAt).toLocaleTimeString()}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        {state.status === "not_configured" && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Traccar secrets not set</AlertTitle>
            <AlertDescription className="space-y-2">
              <div>{state.message}</div>
              <ul className="list-disc pl-5 text-sm">
                {HINTS_MISSING.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <div className="text-xs text-muted-foreground">
                Add these under <b>Admin → Secrets</b>. Nothing is stored in code.
              </div>
            </AlertDescription>
          </Alert>
        )}
        {state.status === "error" && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Validation failed ({state.step})</AlertTitle>
            <AlertDescription className="space-y-2">
              <div className="whitespace-pre-wrap break-words text-sm">{state.message}</div>
              <div className="pt-1">
                <div className="text-xs font-semibold uppercase tracking-wide">Fix suggestions</div>
                <ul className="list-disc pl-5 text-sm">
                  {state.hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {state.status === "checking" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Pinging Traccar server…
          </div>
        )}
      </CardContent>
    </Card>
  );
}
