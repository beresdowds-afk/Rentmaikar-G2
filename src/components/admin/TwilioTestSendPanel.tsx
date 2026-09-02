import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, RefreshCw, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";

type Channel = "sms" | "whatsapp";

interface StatusInfo {
  sid: string;
  status: string;
  errorCode?: number | null;
  errorMessage?: string | null;
  dateSent?: string | null;
  dateUpdated?: string | null;
  to?: string;
  from?: string;
}

const DELIVERED = new Set(["delivered", "read"]);
const FAILED = new Set(["undelivered", "failed"]);

export const TwilioTestSendPanel = () => {
  const [channel, setChannel] = useState<Channel>("sms");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [polling, setPolling] = useState(false);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);


  const invoke = async (method: "POST" | "GET", body?: unknown, sid?: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Not signed in");
    const base = `https://bwvocmhcledbwqlpcswp.functions.supabase.co/twilio-test-send`;
    const url = sid ? `${base}?sid=${encodeURIComponent(sid)}` : base;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || json?.twilio?.message || `HTTP ${res.status}`);
    }
    return json;
  };

  const runDiagnostics = async () => {
    setDiagLoading(true);
    setDiag(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch(
        `https://bwvocmhcledbwqlpcswp.functions.supabase.co/twilio-test-send?diagnostics=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setDiag(json);
      toast.success("Twilio diagnostics complete");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDiagLoading(false);
    }
  };


  const handleSend = async () => {
    setError(null);
    setStatus(null);
    if (!/^\+[1-9]\d{6,14}$/.test(to.trim())) {
      setError("Enter destination in E.164 format, e.g. +15551234567");
      return;
    }
    setSending(true);
    try {
      const res = await invoke("POST", {
        to: to.trim(),
        channel,
        message: message.trim() || undefined,
      });
      setStatus({
        sid: res.sid,
        status: res.twilioStatus ?? "queued",
        to: res.to,
      });
      toast.success(`Test ${channel.toUpperCase()} queued (SID ${res.sid})`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    if (!status?.sid) return;
    setPolling(true);
    try {
      const res = await invoke("GET", undefined, status.sid);
      setStatus({
        sid: res.sid,
        status: res.status,
        errorCode: res.errorCode,
        errorMessage: res.errorMessage,
        dateSent: res.dateSent,
        dateUpdated: res.dateUpdated,
        to: res.to,
        from: res.from,
      });
      if (DELIVERED.has(res.status)) toast.success(`Delivered to ${res.to}`);
      else if (FAILED.has(res.status)) toast.error(`Delivery ${res.status}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPolling(false);
    }
  };

  const statusColor = (s?: string) => {
    if (!s) return "secondary";
    if (DELIVERED.has(s)) return "default";
    if (FAILED.has(s)) return "destructive";
    return "secondary";
  };

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Send className="h-5 w-5" /> Twilio Test Send
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Admin-only. Sends a live SMS or WhatsApp message via Twilio and confirms end-to-end
          delivery. Every send is logged to <code>messaging_events</code>.
        </p>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Configuration diagnostics</p>
            <p className="text-xs text-muted-foreground">
              Read-only check of credentials, sender numbers, messaging service, Trust Hub
              profile and API key — nothing is sent.
            </p>
          </div>
          <Button variant="outline" onClick={runDiagnostics} disabled={diagLoading}>
            {diagLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Run diagnostics
          </Button>
        </div>
        {diag && (
          <>
            <NumberWebhookAudit diag={diag} onRepaired={runDiagnostics} />
            <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-80">
              {JSON.stringify(diag, null, 2)}
            </pre>
          </>
        )}
      </div>



      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Channel</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sms">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> SMS
                </span>
              </SelectItem>
              <SelectItem value="whatsapp">
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> WhatsApp
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Destination (E.164)</Label>
          <Input
            placeholder="+15551234567"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Message (optional)</Label>
        <Textarea
          placeholder="Leave blank for default test message"
          value={message}
          maxLength={320}
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{message.length}/320</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSend} disabled={sending || !to}>
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" /> Send test {channel.toUpperCase()}
            </>
          )}
        </Button>
        {status?.sid && (
          <Button variant="outline" onClick={handleRefresh} disabled={polling}>
            {polling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Check delivery
          </Button>
        )}
      </div>

      {status && (
        <Card className="p-4 bg-muted/40 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span>
            <Badge variant={statusColor(status.status) as never}>{status.status}</Badge>
          </div>
          <div className="text-sm font-mono break-all">SID: {status.sid}</div>
          {status.to && <div className="text-sm">To: {status.to}</div>}
          {status.from && <div className="text-sm">From: {status.from}</div>}
          {status.dateUpdated && (
            <div className="text-xs text-muted-foreground">
              Updated: {new Date(status.dateUpdated).toLocaleString()}
            </div>
          )}
          {status.errorCode && (
            <Alert variant="destructive">
              <AlertDescription>
                Twilio error {status.errorCode}: {status.errorMessage}
              </AlertDescription>
            </Alert>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            Terminal states: <code>delivered</code>, <code>read</code>, <code>undelivered</code>,{" "}
            <code>failed</code>. Delivery receipts also arrive via the twilio-webhook status
            callback.
          </p>
        </Card>
      )}
    </Card>
  );
};

interface NumberWebhookInfo {
  phoneNumber: string;
  ok: boolean;
  problems: string[];
  voiceUrl?: string;
}

const NumberWebhookAudit = ({
  diag,
  onRepaired,
}: {
  diag: Record<string, unknown>;
  onRepaired: () => void;
}) => {
  const [fixing, setFixing] = useState(false);
  const checks = (diag as { checks?: Record<string, any> }).checks;
  const audit = checks?.numberWebhooks;
  if (!audit) return null;
  const numbers: NumberWebhookInfo[] = audit.numbers ?? [];
  const bad = numbers.filter((n) => !n.ok);

  const repair = async () => {
    setFixing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch(
        `https://bwvocmhcledbwqlpcswp.functions.supabase.co/twilio-test-send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fix-number-webhooks" }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      if (json.success) toast.success("Number webhooks repointed to the live backend");
      else toast.error("Some numbers failed to update — check diagnostics");
      onRepaired();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFixing(false);
    }
  };

  return (
    <Alert variant={bad.length ? "destructive" : "default"}>
      <AlertDescription className="space-y-2">
        {bad.length ? (
          <>
            <p className="font-medium">
              {bad.length} number{bad.length > 1 ? "s" : ""} forward calls/SMS to a stale host:
            </p>
            <ul className="list-disc pl-5 text-xs space-y-1">
              {bad.map((n) => (
                <li key={n.phoneNumber}>
                  <span className="font-mono">{n.phoneNumber}</span> — {n.problems.join("; ")}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" onClick={repair} disabled={fixing} className="mt-1">
              {fixing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Repoint all numbers to live backend
            </Button>
          </>
        ) : (
          <p className="text-sm">All owned numbers point their voice/SMS webhooks at the live backend.</p>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default TwilioTestSendPanel;
