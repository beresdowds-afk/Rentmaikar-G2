import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail, Plus, RefreshCw, Save, Trash2, ArrowUpRight, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export const ROUTING_KEY = "email_routing_rules";
export const FORWARDING_CONFIG_KEY = "forwarding_config";

/** Default fallback delivery addresses if platform_email_config is empty. */
export const DELIVERY_ADDRESSES = [
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

export const INBOUND_DOMAIN = "backend.rentmaikar.com";

export interface PlatformEmailItem {
  id: string;
  key: string;
  email: string;
  sender_name: string | null;
  description: string | null;
  is_active: boolean;
}

export interface RoutingRule {
  mailbox: string;
  destinations: string[];
  enabled: boolean;
}

export interface RoutingTable {
  rules: RoutingRule[];
  fallback: string[];
}

export const DEFAULT_TABLE: RoutingTable = {
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

interface InboundEmailRoutingEditorProps {
  embedded?: boolean;
  onUpdated?: () => void;
}

export function InboundEmailRoutingEditor({
  embedded = false,
  onUpdated,
}: InboundEmailRoutingEditorProps) {
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
      toast.error("Could not load inbound forwarding settings");
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
    if (error) {
      toast.error("Failed to save inbound forwarding rules");
    } else {
      toast.success("Inbound forwarding rules saved");
      onUpdated?.();
    }
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
      onUpdated?.();
    }
  };

  return (
    <div className="space-y-4">
      {/* External delivery master card */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between gap-4 py-3.5 px-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">External Email Delivery</CardTitle>
              <Badge variant={forwardingOn ? "default" : "secondary"} className="text-[10px]">
                {forwardingOn ? "Active" : "Paused"}
              </Badge>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Master switch for forwarding inbound mail out of the platform to distribution targets.
            </CardDescription>
          </div>
          <Switch checked={forwardingOn} onCheckedChange={toggleForwarding} aria-label="External email delivery" />
        </CardHeader>
      </Card>

      {/* Distribution source notice */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
        <div className="space-y-0.5">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" /> Platform Email Distribution Source
          </span>
          <p className="text-muted-foreground">
            Target delivery mailboxes are dynamically populated from <strong>Platform Email Addresses</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {embedded && (
            <Button variant="outline" size="sm" asChild className="h-7 text-xs">
              <Link to="/admin/inbound-forwarding">
                Full Page <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-primary hover:underline">
            <a href="/admin?portal=support&tab=contacts">
              Manage Emails <ArrowUpRight className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </div>
      </div>

      {/* Mailbox Rules */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="flex flex-row items-start justify-between gap-4 py-3.5 px-4 border-b border-border/60">
          <div>
            <CardTitle className="text-sm font-semibold">Mailbox Inbound Forwarding Rules</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Select one or more delivery addresses for each inbound mailbox on <span className="font-mono">{INBOUND_DOMAIN}</span>.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 text-xs">
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Reload
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save Rules
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-3.5">
          {loading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            table.rules.map((rule) => (
              <div key={rule.mailbox} className="rounded-lg border border-border/80 p-3 bg-card/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={rule.mailbox === "*" ? "secondary" : "outline"} className="font-mono text-xs">
                      {rule.mailbox === "*" ? "catch-all (*)" : `${rule.mailbox}@${INBOUND_DOMAIN}`}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {rule.destinations.length} destination{rule.destinations.length === 1 ? "" : "s"}
                    </span>
                    {!rule.enabled && <Badge variant="destructive" className="text-[10px]">paused</Badge>}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(v) => updateRule(rule.mailbox, { enabled: v })}
                      aria-label={`Enable routing for ${rule.mailbox}`}
                    />
                    {rule.mailbox !== "*" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => removeMailbox(rule.mailbox)}
                        aria-label={`Remove ${rule.mailbox} rule`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <Separator className="my-2.5" />

                <div className="grid gap-2 sm:grid-cols-2">
                  {deliveryOptions.map(({ email, label, description }) => {
                    const id = `${embedded ? "emb-" : ""}${rule.mailbox}-${email}`;
                    const isSelected = rule.destinations.includes(email);
                    const isDirectMatch = rule.mailbox.toLowerCase() === email.split("@")[0].toLowerCase();
                    return (
                      <label
                        key={id}
                        htmlFor={id}
                        className={`flex items-start gap-2 rounded-md border p-2 text-xs transition-colors cursor-pointer ${
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
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {label}
                              </Badge>
                            )}
                            {isDirectMatch && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                                Primary
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
              <Label htmlFor="new-inbound-mailbox" className="text-xs">
                Add an inbound mailbox
              </Label>
              <Input
                id="new-inbound-mailbox"
                placeholder={`e.g. sales (@${INBOUND_DOMAIN})`}
                value={newMailbox}
                onChange={(e) => setNewMailbox(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMailbox()}
                className="h-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" onClick={addMailbox} className="h-8 text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Mailbox
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export default InboundEmailRoutingEditor;
