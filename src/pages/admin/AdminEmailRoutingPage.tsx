import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail, Plus, RefreshCw, Save, Trash2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";

const ROUTING_KEY = "email_routing_rules";
const FORWARDING_CONFIG_KEY = "forwarding_config";

/** Default fallback delivery addresses if platform_email_config is empty. */
const DELIVERY_ADDRESSES = [
  "support@rentmaikar.com",
  "admin@rentmaikar.com",
  "payments@rentmaikar.com",
  "documents@rentmaikar.com",
  "legal@rentmaikar.com",
  "privacy@rentmaikar.com",
  "dpo@rentmaikar.com",
  "negotiations@rentmaikar.com",
  "notification@rentmaikar.com",
  "noreply@rentmaikar.com",
] as const;

const INBOUND_DOMAIN = "backend.rentmaikar.com";

interface PlatformEmailItem {
  id: string;
  key: string;
  email: string;
  sender_name: string | null;
  description: string | null;
  is_active: boolean;
}

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
    { mailbox: "payments", destinations: ["payments@rentmaikar.com"], enabled: true },
    { mailbox: "documents", destinations: ["documents@rentmaikar.com"], enabled: true },
    { mailbox: "admin", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "legal", destinations: ["legal@rentmaikar.com"], enabled: true },
    { mailbox: "privacy", destinations: ["privacy@rentmaikar.com"], enabled: true },
    { mailbox: "dpo", destinations: ["dpo@rentmaikar.com"], enabled: true },
    { mailbox: "negotiations", destinations: ["negotiations@rentmaikar.com"], enabled: true },
    { mailbox: "nigeria", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "usa", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "notification", destinations: ["notification@rentmaikar.com"], enabled: true },
    { mailbox: "noreply", destinations: ["noreply@rentmaikar.com"], enabled: false },
    { mailbox: "*", destinations: ["support@rentmaikar.com"], enabled: true },
  ],
  fallback: ["support@rentmaikar.com"],
};

export default function AdminEmailRoutingPage() {
  const [table, setTable] = useState<RoutingTable>(DEFAULT_TABLE);
  const [platformEmails, setPlatformEmails] = useState<PlatformEmailItem[]>([]);
  const [forwardingOn, setForwardingOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMailbox, setNewMailbox] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: emailConfigData }, { data: kvData, error }] = await Promise.all([
      supabase
        .from("platform_email_config")
        .select("id, key, email, sender_name, description, is_active")
        .eq("is_active", true)
        .order("key"),
      supabase
        .from("platform_kv_settings")
        .select("key, value")
        .in("key", [ROUTING_KEY, FORWARDING_CONFIG_KEY]),
    ]);
    setLoading(false);

    if (error) {
      toast.error("Could not load email routing settings");
      return;
    }

    const activeEmails = (emailConfigData ?? []) as PlatformEmailItem[];
    setPlatformEmails(activeEmails);

    const rows = (kvData ?? []) as { key: string; value: unknown }[];
    const routing = rows.find((r) => r.key === ROUTING_KEY)?.value as Partial<RoutingTable> | undefined;
    const fwd = rows.find((r) => r.key === FORWARDING_CONFIG_KEY)?.value as
      | { email?: boolean }
      | undefined;

    if (routing?.rules?.length) {
      setTable({
        rules: routing.rules.map((r) => ({
          mailbox: String(r.mailbox ?? "").toLowerCase(),
          destinations: Array.isArray(r.destinations) ? r.destinations.map((d) => d.toLowerCase()) : [],
          enabled: r.enabled !== false,
        })),
        fallback: Array.isArray(routing.fallback) ? routing.fallback.map((d) => d.toLowerCase()) : DEFAULT_TABLE.fallback,
      });
    } else if (activeEmails.length > 0) {
      // Initialize dynamic defaults from active platform email addresses
      const supportEmail = activeEmails.find((e) => e.key.toLowerCase() === "support")?.email || "support@rentmaikar.com";
      const initialRules: RoutingRule[] = activeEmails.map((entry) => ({
        mailbox: entry.key.toLowerCase(),
        destinations: [entry.email.toLowerCase()],
        enabled: entry.key.toLowerCase() !== "noreply",
      }));
      if (!initialRules.some((r) => r.mailbox === "usa")) {
        initialRules.push({ mailbox: "usa", destinations: [supportEmail.toLowerCase()], enabled: true });
      }
      if (!initialRules.some((r) => r.mailbox === "nigeria")) {
        initialRules.push({ mailbox: "nigeria", destinations: [supportEmail.toLowerCase()], enabled: true });
      }
      if (!initialRules.some((r) => r.mailbox === "*")) {
        initialRules.push({ mailbox: "*", destinations: [supportEmail.toLowerCase()], enabled: true });
      }
      setTable({
        rules: initialRules,
        fallback: [supportEmail.toLowerCase()],
      });
    }

    setForwardingOn(!!fwd?.email);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deliveryOptions: { email: string; label?: string; description?: string }[] =
    platformEmails.length > 0
      ? platformEmails.map((p) => ({
          email: p.email.toLowerCase(),
          label: p.sender_name || p.key,
          description: p.description || undefined,
        }))
      : DELIVERY_ADDRESSES.map((email) => ({
          email,
          label: undefined,
          description: undefined,
        }));

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

    const matchingPlatform = platformEmails.find((p) => p.key.toLowerCase() === key);
    const initialDest = matchingPlatform?.email
      ? [matchingPlatform.email.toLowerCase()]
      : platformEmails.length > 0
        ? [platformEmails[0].email.toLowerCase()]
        : ["support@rentmaikar.com"];

    setTable((t) => ({
      ...t,
      rules: [...t.rules, { mailbox: key, destinations: initialDest, enabled: true }],
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
          Every message received on <strong>{INBOUND_DOMAIN}</strong> is distributed externally to the
          addresses selected below, in addition to landing in the Unified Inbox.
        </p>
      </header>

      {/* Platform Email Distribution Information */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="font-semibold text-foreground">Platform Email Distribution</span>
          <p className="text-muted-foreground">
            Delivery targets are sourced directly from <strong>Platform Email Addresses</strong> (managed under Contact Settings). Any active address configured there is available here for distribution.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0 h-8 text-xs">
          <a href="/admin?portal=comms&tab=contacts">
            Manage Platform Emails <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

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
                  {deliveryOptions.map(({ email, label, description }) => {
                    const id = `${rule.mailbox}-${email}`;
                    const isSelected = rule.destinations.includes(email);
                    const isDirectMatch = rule.mailbox.toLowerCase() === email.split("@")[0].toLowerCase();
                    return (
                      <label
                        key={id}
                        htmlFor={id}
                        className={`flex items-start gap-2.5 rounded-md border p-2.5 text-xs transition-colors cursor-pointer ${
                          isSelected ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          id={id}
                          checked={isSelected}
                          onCheckedChange={(v) => toggleDestination(rule, email, v === true)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-medium text-foreground">{email}</span>
                            {label && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {label}
                              </Badge>
                            )}
                            {isDirectMatch && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                                Dedicated
                              </Badge>
                            )}
                          </div>
                          {description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{description}</p>
                          )}
                        </div>
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
