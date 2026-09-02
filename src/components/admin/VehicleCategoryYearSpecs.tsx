import { useEffect, useState } from "react";
import {
  isRegionYearSpecsVisible,
  setRegionYearSpecsVisibility,
} from "@/hooks/useCategoryYearSpecs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, X, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type YearSpec = {
  id: string;
  category: string;
  region: string;
  min_year: number;
  max_year: number;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

const REGIONS = ["USA", "NIGERIA"] as const;
const DEFAULT_CATEGORIES = ["budget", "standard", "premium"] as const;

export const VehicleCategoryYearSpecs = () => {
  const queryClient = useQueryClient();
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [drafts, setDrafts] = useState<Record<string, Partial<YearSpec>>>({});
  const [showNew, setShowNew] = useState(false);
  const [newRow, setNewRow] = useState<Partial<YearSpec>>({
    category: "",
    region: "USA",
    min_year: new Date().getFullYear() - 5,
    max_year: new Date().getFullYear(),
    label: "",
    description: "",
    sort_order: 99,
    is_active: true,
  });

  const { data: specs = [], isLoading } = useQuery({
    queryKey: ["vehicle-category-year-specs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_category_year_specs")
        .select("*")
        .order("region")
        .order("sort_order");
      if (error) throw error;
      return data as YearSpec[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: YearSpec) => {
      const { min_year, max_year } = patch;
      if (max_year < min_year) throw new Error("Max year must be ≥ min year");
      const { error } = await supabase
        .from("vehicle_category_year_specs")
        .update({
          category: patch.category.trim().toLowerCase(),
          region: patch.region,
          min_year,
          max_year,
          label: patch.label.trim(),
          description: patch.description?.trim() || null,
          sort_order: patch.sort_order,
          is_active: patch.is_active,
        })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: (_data, patch) => {
      toast.success("Specification updated");
      setDrafts((d) => {
        const { [patch.id]: _, ...rest } = d;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: ["vehicle-category-year-specs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vehicle_category_year_specs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Specification removed");
      queryClient.invalidateQueries({ queryKey: ["vehicle-category-year-specs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: async (row: Partial<YearSpec>) => {
      if (!row.category || !row.label || row.min_year == null || row.max_year == null) {
        throw new Error("Category, label, min year and max year are required");
      }
      if ((row.max_year as number) < (row.min_year as number)) {
        throw new Error("Max year must be ≥ min year");
      }
      const { error } = await supabase
        .from("vehicle_category_year_specs")
        .insert({
          category: (row.category as string).trim().toLowerCase(),
          region: row.region as string,
          min_year: row.min_year as number,
          max_year: row.max_year as number,
          label: (row.label as string).trim(),
          description: (row.description as string | null)?.trim() || null,
          sort_order: row.sort_order ?? 99,
          is_active: row.is_active ?? true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Specification added");
      setShowNew(false);
      setNewRow({
        category: "",
        region: "USA",
        min_year: new Date().getFullYear() - 5,
        max_year: new Date().getFullYear(),
        label: "",
        description: "",
        sort_order: 99,
        is_active: true,
      });
      queryClient.invalidateQueries({ queryKey: ["vehicle-category-year-specs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = specs.filter((s) => regionFilter === "ALL" || s.region === regionFilter);
  const getDraft = (row: YearSpec): YearSpec => ({ ...row, ...drafts[row.id] });
  const setField = (id: string, patch: Partial<YearSpec>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  return (
    <Card className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Vehicle Category — Year Specifications</h2>
            <p className="text-sm text-muted-foreground">
              Editable year-model ranges powering Budget / Standard / Premium tiers per region.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All regions</SelectItem>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowNew((v) => !v)} className="gap-2">
            <Plus className="h-4 w-4" /> New spec
          </Button>
        </div>
      </div>

      <RegionVisibilityPanel />


      {showNew && (
        <Card className="p-4 mb-6 border-dashed">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-1">
              <Label>Region</Label>
              <Select
                value={newRow.region as string}
                onValueChange={(v) => setNewRow((r) => ({ ...r, region: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label>Category key</Label>
              <Input
                value={newRow.category as string}
                onChange={(e) => setNewRow((r) => ({ ...r, category: e.target.value }))}
                placeholder="e.g. luxury"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="md:col-span-1">
              <Label>Label</Label>
              <Input
                value={newRow.label as string}
                onChange={(e) => setNewRow((r) => ({ ...r, label: e.target.value }))}
                placeholder="Premium"
              />
            </div>
            <div className="md:col-span-1">
              <Label>Min year</Label>
              <Input
                type="number"
                value={newRow.min_year as number}
                onChange={(e) => setNewRow((r) => ({ ...r, min_year: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-1">
              <Label>Max year</Label>
              <Input
                type="number"
                value={newRow.max_year as number}
                onChange={(e) => setNewRow((r) => ({ ...r, max_year: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-1">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={newRow.sort_order as number}
                onChange={(e) => setNewRow((r) => ({ ...r, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-6">
              <Label>Description</Label>
              <Textarea
                value={(newRow.description as string) ?? ""}
                onChange={(e) => setNewRow((r) => ({ ...r, description: e.target.value }))}
                placeholder="Short public-facing description for this tier"
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newRow)}
              disabled={createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No specifications for this filter yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const draft = getDraft(row);
            const dirty = !!drafts[row.id];
            return (
              <Card key={row.id} className={`p-4 ${dirty ? "ring-1 ring-primary/40" : ""}`}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-1">
                    <Label className="text-xs">Region</Label>
                    <Select
                      value={draft.region}
                      onValueChange={(v) => setField(row.id, { region: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Category key</Label>
                    <Input
                      value={draft.category}
                      onChange={(e) => setField(row.id, { category: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={draft.label}
                      onChange={(e) => setField(row.id, { label: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs">Min year</Label>
                    <Input
                      type="number"
                      value={draft.min_year}
                      onChange={(e) => setField(row.id, { min_year: Number(e.target.value) })}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs">Max year</Label>
                    <Input
                      type="number"
                      value={draft.max_year}
                      onChange={(e) => setField(row.id, { max_year: Number(e.target.value) })}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs">Sort</Label>
                    <Input
                      type="number"
                      value={draft.sort_order}
                      onChange={(e) => setField(row.id, { sort_order: Number(e.target.value) })}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={draft.description ?? ""}
                      onChange={(e) => setField(row.id, { description: e.target.value })}
                      rows={1}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={draft.is_active}
                        onCheckedChange={(v) => setField(row.id, { is_active: v })}
                        aria-label="Active"
                      />
                      <span className="text-xs text-muted-foreground">Active</span>
                    </div>
                    <Badge variant={draft.is_active ? "default" : "secondary"}>
                      {draft.min_year} – {draft.max_year}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {dirty && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDrafts((d) => {
                          const { [row.id]: _, ...rest } = d;
                          return rest;
                        })}
                        className="gap-1"
                      >
                        <X className="h-4 w-4" /> Discard
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate(draft)}
                      disabled={!dirty || updateMutation.isPending}
                      className="gap-1"
                    >
                      {updateMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive gap-1"
                      onClick={() => {
                        if (confirm(`Delete ${row.label} (${row.region})?`)) {
                          deleteMutation.mutate(row.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Card>
  );
};

const RegionVisibilityPanel = () => {
  const REGIONS_LIST = ["USA", "NIGERIA"] as const;
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REGIONS_LIST.map((r) => [r, isRegionYearSpecsVisible(r)])),
  );

  useEffect(() => {
    const handler = () => {
      setVisibility(
        Object.fromEntries(REGIONS_LIST.map((r) => [r, isRegionYearSpecsVisible(r)])),
      );
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggle = (region: string, value: boolean) => {
    setRegionYearSpecsVisibility(region, value);
    setVisibility((v) => ({ ...v, [region]: value }));
    toast.success(
      `Year specs ${value ? "shown" : "hidden"} for ${region} on public pages`,
    );
  };

  return (
    <Card className="p-4 mb-6 bg-muted/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Public visibility per region</p>
          <p className="text-xs text-muted-foreground">
            Hide year-model badges from the driver-facing category cards without
            deleting the underlying specs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {REGIONS_LIST.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <Switch
                checked={visibility[r] ?? true}
                onCheckedChange={(v) => toggle(r, v)}
                aria-label={`Toggle year-spec visibility for ${r}`}
              />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
};


export default VehicleCategoryYearSpecs;
