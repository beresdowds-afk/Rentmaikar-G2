import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";

const ROUTING_KEY = "email_routing_rules";
const FORWARDING_CONFIG_KEY = "forwarding_config";

/** External mailboxes inbound mail can be delivered to. */
const DELIVERY_ADDRESSES = [
  "support@rentmaikar.com",
  "noreply@rentmaikar.com",
  "admin@rentmaikar.com",
  "notification@rentmaikar.com",
] as const;

const INBOUND_DOMAIN = "backend.rentmaikar.com";

interface RoutingRule {
  mailbox: string;
  destinations: string[];
  enabled: boolean;
}

interface RoutingTable {
  rules: RoutingRule[];
  fallback: string[];
}

const DEFAULT_TABLE: RoutingTable = {
  rules: [
    { mailbox: "support", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "payments", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "documents", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "admin", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "legal", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "privacy", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "dpo", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "nigeria", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "usa", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "negotiations", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "noreply", destinations: ["noreply@rentmaikar.com"], enabled: false },
    { mailbox: "*", destinations: ["support@rentmaikar.com"], enabled: true },
  ],
  fallback: ["support@rentmaikar.com"],
};

export default function AdminEmailRoutingPage() {
  const [table, setTable] = useState<RoutingTable>(DEFAULT_TABLE);
  const [forwardingOn, setForwardingOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMailbox, setNewMailbox] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("platform_kv_settings")
      .select("key, value")
      .in("key", [ROUTING_KEY, FORWARDING_CONFIG_KEY]);
    setLoading(false);
    if (error) {
      toast.error("Could not load email routing settings");
      return;
    }
    const rows = (data ?? []) as { key: string; value: unknown }[];
    const routing = rows.find((r) => r.key === ROUTING_KEY)?.value as Partial<RoutingTable> | undefined;
    const fwd = rows.find((r) => r.key === FORWARDING_CONFIG_KEY)?.value as
      | { email?: boolean }
      | undefined;
    if (routing?.rules?.length) {
      setTable({
        rules: routing.rules.map((r) => ({
          mailbox: String(r.mailbox ?? "").toLowerCase(),
          destinations: Array.isArray(r.destinations) ? r.destinations : [],
          enabled: r.enabled !== false,
        })),
        fallback: Array.isArray(routing.fallback) ? routing.fallback : DEFAULT_TABLE.fallback,
      });
    }
    setForwardingOn(!!fwd?.email);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRule = (mailbox: string, patch: Partial<RoutingRule>) =>
    setTable((t) => ({
      ...t,
      rules: t.rules.map((r) => (r.mailbox === mailbox ? { ...r, ...patch } : r)),
    }));

  const toggleDestination = (rule: RoutingRule, address: string, on: boolean) =>
    updateRule(rule.mailbox, {
      destinations: on
        ? Array.from(new Set([...rule.destinations, address]))
        : rule.destinations.filter((d) => d !== address),
    });

  const addMailbox = () => {
    const key = newMailbox.trim().toLowerCase().split("@")[0];
    if (!key) return;
    if (table.rules.some((r) => r.mailbox === key)) {
      toast.error("That mailbox already has a rule");
      return;
    }
    setTable((t) => ({
      ...t,
      rules: [...t.rules, { mailbox: key, destinations: ["support@rentmaikar.com"], enabled: true }],
    }));
    setNewMailbox("");
  };

  const removeMailbox = (mailbox: string) =>
    setTable((t) => ({ ...t, rules: t.rules.filter((r) => r.mailbox !== mailbox) }));

  const save = async () => {
    const invalid = table.rules.find((r) => r.enabled && r.destinations.length === 0);
    if (invalid) {
      toast.error(`${invalid.mailbox}@ has no delivery address selected`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("platform_kv_settings")
      .upsert({ key: ROUTING_KEY, value: table as never }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error("Failed to save routing table");
    else toast.success("Email routing table saved");
  };

  const toggleForwarding = async (value: boolean) => {
    setForwardingOn(value);
    const { data } = await supabase
      .from("platform_kv_settings")
      .select("value")
      .eq("key", FORWARDING_CONFIG_KEY)
      .maybeSingle();
    const current = (data?.value ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from("platform_kv_settings")
      .upsert({ key: FORWARDING_CONFIG_KEY, value: { ...current, email: value } as never }, { onConflict: "key" });
    if (error) {
      setForwardingOn(!value);
      toast.error("Failed to update external delivery switch");
    } else {
      toast.success(value ? "External email delivery enabled" : "External email delivery paused");
    }
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Seo
        title="Email Routing | Rentmaikar Admin"
        description="Route inbound Rentmaikar mailboxes to external delivery addresses."
        path="/admin/email-routing"
      />

      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Mail className="h-6 w-6 text-primary" /> Email Routing
        </h1>
        <p className="text-sm text-muted-foreground">
          Every message received on <strong>{INBOUND_DOMAIN}</strong> is delivered externally to the
          addresses selected below, in addition to landing in the Unified Inbox.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">External delivery</CardTitle>
            <CardDescription>Master switch for forwarding inbound mail out of the platform.</CardDescription>
          </div>
          <Switch checked={forwardingOn} onCheckedChange={toggleForwarding} aria-label="External email delivery" />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Mailbox rules</CardTitle>
            <CardDescription>
              Pick one or more delivery addresses per mailbox. <code>*</code> is the catch-all for any
              address without its own rule.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Reload
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading routing table…</p>
          ) : (
            table.rules.map((rule) => (
              <div key={rule.mailbox} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={rule.mailbox === "*" ? "secondary" : "outline"} className="font-mono">
                      {rule.mailbox === "*" ? "catch-all" : `${rule.mailbox}@${INBOUND_DOMAIN}`}
                    </Badge>
                    {!rule.enabled && <span className="text-xs text-muted-foreground">paused</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(v) => updateRule(rule.mailbox, { enabled: v })}
                      aria-label={`Enable routing for ${rule.mailbox}`}
                    />
                    {rule.mailbox !== "*" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMailbox(rule.mailbox)}
                        aria-label={`Remove ${rule.mailbox} rule`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {DELIVERY_ADDRESSES.map((address) => {
                    const id = `${rule.mailbox}-${address}`;
                    return (
                      <label key={id} htmlFor={id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id={id}
                          checked={rule.destinations.includes(address)}
                          onCheckedChange={(v) => toggleDestination(rule, address, v === true)}
                        />
                        <span className="font-mono text-xs">{address}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          <div className="flex items-end gap-2 pt-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-mailbox" className="text-xs">
                Add a mailbox
              </Label>
              <Input
                id="new-mailbox"
                placeholder={`e.g. billing (@${INBOUND_DOMAIN})`}
                value={newMailbox}
                onChange={(e) => setNewMailbox(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMailbox()}
              />
            </div>
            <Button variant="outline" onClick={addMailbox}>
              <Plus className="mr-2 h-4 w-4" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
