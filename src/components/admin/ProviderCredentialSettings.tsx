import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { friendlySecretError, secretErrorDescription } from "@/lib/secret-errors";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useCredentialVerification } from "@/hooks/useCredentialVerification";

/**
 * Vault-backed credential rotation for providers that previously required an
 * env-var redeploy (Hologram, Traccar). Values are written through
 * `provider_write_credentials`; only masked previews are ever readable.
 */

interface Version {
  id: string;
  provider: string;
  masked: Record<string, string>;
  status: string;
  created_at: string;
  notes: string | null;
}

const FIELDS: Record<"hologram" | "traccar", Array<{ key: string; label: string; secret: boolean }>> = {
  hologram: [
    { key: "api_key", label: "API key", secret: true },
    { key: "org_id", label: "Organisation ID", secret: false },
  ],
  traccar: [
    { key: "base_url", label: "Base URL", secret: false },
    { key: "token", label: "API token (or use email + password)", secret: true },
    { key: "email", label: "Email", secret: false },
    { key: "password", label: "Password", secret: true },
  ],
};

function ProviderForm({ provider }: { provider: "hologram" | "traccar" }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const { verifyAfterSave, running } = useCredentialVerification();

  const save = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v && v.trim().length > 0),
      );
      if (Object.keys(payload).length === 0) throw new Error("Enter at least one value");
      const { error } = await supabase.rpc("provider_write_credentials" as never, {
        _provider: provider,
        _values: payload,
        _notes: null,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(`${provider} credentials rotated — verifying…`);
      setValues({});
      qc.invalidateQueries({ queryKey: ["provider-credential-versions"] });
      // Immediately confirm the new credentials actually authenticate.
      await verifyAfterSave(provider);
    },
    onError: (e: Error) => {
      const friendly = friendlySecretError(e, provider);
      toast.error(friendly.title, { description: secretErrorDescription(friendly), duration: 10000 });
    },
  });

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium capitalize">{provider}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[provider].map((f) => (
          <div key={f.key}>
            <Label htmlFor={`${provider}-${f.key}`}>{f.label}</Label>
            <Input
              id={`${provider}-${f.key}`}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              placeholder="Leave blank to keep current"
            />
          </div>
        ))}
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || running.includes(provider)}>
        {save.isPending || running.includes(provider) ? "Saving & verifying…" : "Save & verify"}
      </Button>
    </div>
  );
}

export default function ProviderCredentialSettings() {
  const versionsQuery = useQuery({
    queryKey: ["provider-credential-versions"],
    queryFn: async (): Promise<Version[]> => {
      const { data, error } = await supabase
        .from("provider_credential_versions" as never)
        .select("id, provider, masked, status, created_at, notes")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Version[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Provider credentials
        </CardTitle>
        <CardDescription>
          Rotate Hologram and Traccar credentials without a redeploy. Values are stored encrypted;
          backend jobs pick them up within a minute and fall back to the deployed secrets if unset.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProviderForm provider="hologram" />
        <ProviderForm provider="traccar" />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Rotation history</p>
          {!versionsQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">
              No admin-managed credentials yet — deployed secrets are in use.
            </p>
          ) : (
            versionsQuery.data.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                <span className="capitalize">{v.provider}</span>
                <span className="text-muted-foreground">
                  {Object.entries(v.masked).map(([k, m]) => `${k}: ${m}`).join(" · ")}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{v.status}</Badge>
                  {new Date(v.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
