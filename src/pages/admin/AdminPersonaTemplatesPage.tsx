import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, PlayCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PersonaIdClassSettings from "@/components/admin/PersonaIdClassSettings";


type Role = "driver" | "owner" | "referee" | "proxy" | "admin_assistant" | "support_staff";

const ROLE_LABELS: Record<Role, string> = {
  driver: "Driver",
  owner: "Owner",
  referee: "Driver referee",
  proxy: "Driver payment proxy",
  admin_assistant: "Admin assistant",
  support_staff: "Support staff",
};

interface RoleRow {
  subject_role: Role;
  template_id: string;
  environment_id: string | null;
  notes: string | null;
  updated_at: string | null;
  is_override: boolean;
}

const PERSONA_SDK_URL = "https://cdn.withpersona.com/dist/persona-v5.5.0.js";
const PERSONA_SDK_INTEGRITY =
  "sha384-UK+a2yEU9KOzEmsgI4IlkrXWE4AekM/iAgWF60Zuyule702g7qaQ2nYccO3tnT0A";

function loadPersonaSdk(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).Persona) return resolve((window as any).Persona);
    const s = document.createElement("script");
    s.src = PERSONA_SDK_URL;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.integrity = PERSONA_SDK_INTEGRITY;
    s.onload = () => resolve((window as any).Persona);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function AdminPersonaTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<Role | null>(null);
  const [testingRole, setTestingRole] = useState<Role | null>(null);
  const [envId, setEnvId] = useState<string | null>(null);
  const [rows, setRows] = useState<RoleRow[]>([]);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("persona-config", { method: "GET" });
    setLoading(false);
    if (error) {
      toast.error(`Failed to load Persona config: ${error.message}`);
      return;
    }
    setEnvId(data?.environment_id ?? null);
    setRows(data?.roles ?? []);
  }

  useEffect(() => { refresh(); }, []);

  function updateField(role: Role, patch: Partial<RoleRow>) {
    setRows((prev) => prev.map((r) => (r.subject_role === role ? { ...r, ...patch } : r)));
  }

  async function save(row: RoleRow) {
    if (!row.template_id || row.template_id.trim().length < 3) {
      toast.error("Template ID is required");
      return;
    }
    setSavingRole(row.subject_role);
    const { error } = await supabase.functions.invoke("persona-config", {
      method: "POST",
      body: {
        subject_role: row.subject_role,
        template_id: row.template_id.trim(),
        environment_id: row.environment_id?.trim() || null,
        notes: row.notes ?? null,
      },
    });
    setSavingRole(null);
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    toast.success(`${ROLE_LABELS[row.subject_role]} template saved`);
    refresh();
  }

  async function testOpen(row: RoleRow) {
    const effectiveEnv = row.environment_id?.trim() || envId;
    if (!effectiveEnv) {
      toast.error("No environment ID configured. Set PERSONA_ENVIRONMENT_ID or add one to this role.");
      return;
    }
    setTestingRole(row.subject_role);
    try {
      const Persona = await loadPersonaSdk();
      const client = new Persona.Client({
        templateId: row.template_id.trim(),
        environmentId: effectiveEnv,
        onReady: () => client.open(),
        onComplete: ({ inquiryId, status }: any) => {
          toast.success(`Test inquiry ${inquiryId ?? ""} → ${status}`);
        },
        onCancel: () => toast.info("Test cancelled"),
        onError: (e: any) => toast.error(`Persona error: ${e?.message ?? "unknown"}`),
      });
    } catch (e: any) {
      toast.error(`Could not launch Persona: ${e?.message ?? e}`);
    } finally {
      setTestingRole(null);
    }
  }

  return (
    <>
      <Header />
      <main className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Persona Templates</h1>
            <p className="text-sm text-muted-foreground">
              Per-role Persona inquiry template IDs. Changes take effect on the next inquiry.
            </p>
          </div>
        </div>

        <Alert>
          <AlertDescription>
            Environment ID (from <code>PERSONA_ENVIRONMENT_ID</code>):{" "}
            {envId ? <code>{envId}</code> : <span className="text-destructive">not set</span>}. Individual roles may override it below.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="id-classes">Accepted ID types</TabsTrigger>
          </TabsList>

          <TabsContent value="id-classes">
            <PersonaIdClassSettings />
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          rows.map((row) => (
            <Card key={row.subject_role}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{ROLE_LABELS[row.subject_role]}</CardTitle>
                    <CardDescription>subject_role: <code>{row.subject_role}</code></CardDescription>
                  </div>
                  <Badge variant={row.is_override ? "default" : "secondary"}>
                    {row.is_override ? "Custom" : "Default"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor={`tpl-${row.subject_role}`}>Template ID</Label>
                  <Input
                    id={`tpl-${row.subject_role}`}
                    value={row.template_id ?? ""}
                    placeholder="itmpl_..."
                    onChange={(e) => updateField(row.subject_role, { template_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`env-${row.subject_role}`}>Environment ID override (optional)</Label>
                  <Input
                    id={`env-${row.subject_role}`}
                    value={row.environment_id ?? ""}
                    placeholder={envId ?? "env_..."}
                    onChange={(e) => updateField(row.subject_role, { environment_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`notes-${row.subject_role}`}>Notes</Label>
                  <Textarea
                    id={`notes-${row.subject_role}`}
                    value={row.notes ?? ""}
                    rows={2}
                    onChange={(e) => updateField(row.subject_role, { notes: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button onClick={() => save(row)} disabled={savingRole === row.subject_role}>
                    {savingRole === row.subject_role ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => testOpen(row)} disabled={testingRole === row.subject_role}>
                    {testingRole === row.subject_role ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                    Test open
                  </Button>
                  {row.updated_at && (
                    <span className="text-xs text-muted-foreground">Updated {new Date(row.updated_at).toLocaleString()}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
          </TabsContent>
        </Tabs>

      </main>
      <Footer />
    </>
  );
}
