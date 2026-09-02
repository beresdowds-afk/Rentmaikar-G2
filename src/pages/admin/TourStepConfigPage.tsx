import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { TourPreviewModal } from "@/components/admin/TourPreviewModal";

const TOURS = ["landing", "admin", "vehicle-support", "iot-support", "legal-support"];
const COUNTRIES = ["USA", "Nigeria"];

interface TourStep {
  id: string;
  title: string;
  content: string;
  target?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

interface ValidationIssue {
  index: number;
  field: string;
  message: string;
}

function validateSteps(steps: TourStep[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(steps) || steps.length === 0) {
    return [{ index: -1, field: "steps", message: "At least one step is required" }];
  }
  const seenIds = new Set<string>();
  steps.forEach((s, i) => {
    if (!s.id?.trim()) issues.push({ index: i, field: "id", message: "Step id is required" });
    else if (!/^[a-z0-9-_]+$/i.test(s.id)) issues.push({ index: i, field: "id", message: "Id must be alphanumeric / dash / underscore" });
    else if (seenIds.has(s.id)) issues.push({ index: i, field: "id", message: `Duplicate id "${s.id}"` });
    seenIds.add(s.id);
    if (!s.title?.trim()) issues.push({ index: i, field: "title", message: "Title is required" });
    else if (s.title.length > 120) issues.push({ index: i, field: "title", message: "Title must be under 120 chars" });
    if (!s.content?.trim()) issues.push({ index: i, field: "content", message: "Content is required" });
    else if (s.content.length > 1000) issues.push({ index: i, field: "content", message: "Content must be under 1000 chars" });
    if (s.placement && !["top", "bottom", "left", "right", "center"].includes(s.placement)) {
      issues.push({ index: i, field: "placement", message: "Invalid placement" });
    }
  });
  return issues;
}

export default function TourStepConfigPage() {
  const [tour, setTour] = useState(TOURS[0]);
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const issues = useMemo(() => validateSteps(steps), [steps]);
  const isValid = issues.length === 0;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tour_step_configs")
      .select("*")
      .eq("tour_name", tour)
      .eq("country", country)
      .maybeSingle();
    setLoading(false);
    if (error) {
      toast.error("Failed to load config");
      return;
    }
    if (data) {
      setExistingId(data.id);
      setSteps((data.steps as unknown as TourStep[]) ?? []);
      setIsActive(data.is_active);
    } else {
      setExistingId(null);
      setSteps([]);
      setIsActive(true);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tour, country]);

  const addStep = () => setSteps((s) => [...s, { id: `step-${s.length + 1}`, title: "", content: "", placement: "bottom" }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<TourStep>) =>
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));

  const save = async () => {
    if (!isValid) {
      toast.error("Fix validation errors before saving");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      tour_name: tour,
      country,
      steps: steps as unknown as never,
      is_active: isActive,
      updated_by: userData.user?.id ?? null,
    };
    const { error } = existingId
      ? await supabase.from("tour_step_configs").update(payload).eq("id", existingId)
      : await supabase.from("tour_step_configs").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Tour configuration saved");
    load();
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tour Step Configuration</h1>
        <p className="text-muted-foreground text-sm">Edit onboarding tour steps per country. All changes are validated before saving.</p>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Tour</Label>
            <Select value={tour} onValueChange={setTour}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TOURS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Active" : "Inactive"}</Badge>
            <Button variant="outline" size="sm" onClick={() => setIsActive(v => !v)}>Toggle</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
      ) : (
        <>
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isValid ? (
                  <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm">Valid ({steps.length} steps)</span></>
                ) : (
                  <><AlertTriangle className="w-4 h-4 text-destructive" /><span className="text-sm">{issues.length} issue(s)</span></>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addStep}><Plus className="w-4 h-4 mr-1" />Add step</Button>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={steps.length === 0}>
                  <Play className="w-4 h-4 mr-1" />Preview
                </Button>
                <Button size="sm" disabled={!isValid || saving} onClick={save}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Save
                </Button>
              </div>
            </div>

            {!isValid && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  <ul className="list-disc ml-4 text-xs">
                    {issues.slice(0, 8).map((iss, k) => (
                      <li key={k}>Step {iss.index >= 0 ? iss.index + 1 : "-"} · {iss.field}: {iss.message}</li>
                    ))}
                    {issues.length > 8 && <li>...and {issues.length - 8} more</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </Card>

          <div className="space-y-3">
            {steps.map((step, i) => {
              const stepIssues = issues.filter(x => x.index === i);
              return (
                <Card key={i} className={`p-4 ${stepIssues.length ? "border-destructive" : ""}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">Step {i + 1}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeStep(i)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>ID</Label>
                      <Input value={step.id} onChange={e => updateStep(i, { id: e.target.value })} />
                    </div>
                    <div>
                      <Label>Target selector (optional)</Label>
                      <Input value={step.target ?? ""} onChange={e => updateStep(i, { target: e.target.value })} placeholder="#my-element" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Title</Label>
                      <Input value={step.title} onChange={e => updateStep(i, { title: e.target.value })} maxLength={120} />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Content</Label>
                      <Textarea value={step.content} onChange={e => updateStep(i, { content: e.target.value })} maxLength={1000} rows={3} />
                    </div>
                    <div>
                      <Label>Placement</Label>
                      <Select value={step.placement ?? "bottom"} onValueChange={(v) => updateStep(i, { placement: v as TourStep["placement"] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["top", "bottom", "left", "right", "center"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {stepIssues.length > 0 && (
                    <div className="mt-2 text-xs text-destructive">
                      {stepIssues.map((iss, k) => <div key={k}>• {iss.field}: {iss.message}</div>)}
                    </div>
                  )}
                </Card>
              );
            })}
            {steps.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground text-sm">
                No steps configured. Click "Add step" to begin.
              </Card>
            )}
          </div>
        </>
      )}

      <TourPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        steps={steps}
        tour={tour}
        country={country}
      />
    </div>
  );
}
