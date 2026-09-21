import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  GraduationCap, 
  Video, 
  FileText, 
  Upload, 
  Volume2, 
  VolumeX,
  Eye, 
  ArrowUp, 
  ArrowDown,
  RotateCcw,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  BookOpen,
  Sparkles,
  RefreshCw,
  SlidersHorizontal
} from "lucide-react";
import { DEFAULT_TRAINING_MODULES } from "@/data/defaultTrainingModules";
import { Link } from "react-router-dom";

export interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  module_order: number;
  script_content: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  region: string;
  created_at?: string;
}

export const TrainingModuleManagement = () => {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<TrainingModule | null>(null);
  const [previewModule, setPreviewModule] = useState<TrainingModule | null>(null);
  const [uploading, setUploading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegionTab, setSelectedRegionTab] = useState<"all_regions" | "global" | "nigeria">("all_regions");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [form, setForm] = useState({
    title: "",
    description: "",
    script_content: "",
    video_url: "",
    duration_minutes: 25,
    is_active: true,
    region: "all",
  });

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("training_modules")
      .select("*")
      .order("region", { ascending: true })
      .order("module_order", { ascending: true });

    if (error) {
      console.error("Error fetching modules:", error);
      toast.error("Failed to load training modules: " + error.message);
    } else {
      setModules((data as TrainingModule[]) || []);
    }
    setLoading(false);
  };

  // Restore Default Modules Function
  const handleRestoreDefaults = async () => {
    setRestoring(true);
    try {
      let restoredCount = 0;
      let updatedCount = 0;

      for (const defMod of DEFAULT_TRAINING_MODULES) {
        // Normalize region match (treat Nigeria and NG as same region curriculum)
        const existing = modules.find(
          m => m.title.trim().toLowerCase() === defMod.title.trim().toLowerCase() ||
               (m.region === defMod.region && m.module_order === defMod.module_order)
        );

        if (existing) {
          // Update missing content or script if it was altered/wiped
          const { error } = await supabase
            .from("training_modules")
            .update({
              title: defMod.title,
              description: defMod.description,
              script_content: defMod.script_content,
              video_url: defMod.video_url || existing.video_url,
              duration_minutes: defMod.duration_minutes,
              is_active: true,
              region: defMod.region,
              module_order: defMod.module_order,
            })
            .eq("id", existing.id);

          if (!error) updatedCount++;
        } else {
          // Insert new module
          const { error } = await supabase
            .from("training_modules")
            .insert({
              title: defMod.title,
              description: defMod.description,
              script_content: defMod.script_content,
              video_url: defMod.video_url,
              duration_minutes: defMod.duration_minutes,
              is_active: true,
              region: defMod.region,
              module_order: defMod.module_order,
            });

          if (!error) restoredCount++;
        }
      }

      toast.success(
        `Curriculum restored! Restored ${restoredCount} new, refreshed ${updatedCount} modules (8 courses total).`
      );
      setRestoreDialogOpen(false);
      await fetchModules();
    } catch (err: any) {
      console.error("Restore error:", err);
      toast.error("Failed to restore default modules: " + (err.message || "Unknown error"));
    } finally {
      setRestoring(false);
    }
  };

  const handleToggleActive = async (mod: TrainingModule) => {
    const newStatus = !mod.is_active;
    const { error } = await supabase
      .from("training_modules")
      .update({ is_active: newStatus })
      .eq("id", mod.id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_active: newStatus } : m));
      toast.success(`Module "${mod.title}" marked as ${newStatus ? "active" : "inactive"}`);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 50MB.");
      return;
    }

    setUploading(true);
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("training-media")
      .upload(fileName, file);

    if (error) {
      toast.error("Failed to upload video: " + error.message);
    } else {
      const { data: urlData } = supabase.storage
        .from("training-media")
        .getPublicUrl(fileName);
      setForm(prev => ({ ...prev, video_url: urlData.publicUrl }));
      toast.success("Video uploaded successfully");
    }
    setUploading(false);
  };

  const handleScriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setForm(prev => ({ ...prev, script_content: text }));
      toast.success("Script loaded from file");
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    if (editingModule) {
      const { error } = await supabase
        .from("training_modules")
        .update({
          title: form.title.trim(),
          description: form.description?.trim() || null,
          script_content: form.script_content || null,
          video_url: form.video_url?.trim() || null,
          duration_minutes: form.duration_minutes,
          is_active: form.is_active,
          region: form.region,
        })
        .eq("id", editingModule.id);

      if (error) {
        toast.error("Failed to update module: " + error.message);
      } else {
        toast.success("Module updated successfully");
        setDialogOpen(false);
        resetForm();
        fetchModules();
      }
    } else {
      // Calculate max order within the same region
      const sameRegionModules = modules.filter(m => m.region === form.region);
      const nextOrder = sameRegionModules.length > 0 
        ? Math.max(...sameRegionModules.map(m => m.module_order)) + 1 
        : 1;

      const { error } = await supabase
        .from("training_modules")
        .insert({
          title: form.title.trim(),
          description: form.description?.trim() || null,
          script_content: form.script_content || null,
          video_url: form.video_url?.trim() || null,
          duration_minutes: form.duration_minutes,
          is_active: form.is_active,
          region: form.region,
          module_order: nextOrder,
        });

      if (error) {
        toast.error("Failed to create module: " + error.message);
      } else {
        toast.success("Module created successfully");
        setDialogOpen(false);
        resetForm();
        fetchModules();
      }
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    const { error } = await supabase.from("training_modules").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete module: " + error.message);
    } else {
      toast.success("Module deleted");
      setModules(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleReorder = async (id: string, direction: "up" | "down") => {
    const targetModule = modules.find(m => m.id === id);
    if (!targetModule) return;

    // Scope reordering within the same region
    const regionMods = modules
      .filter(m => m.region === targetModule.region)
      .sort((a, b) => a.module_order - b.module_order);

    const idx = regionMods.findIndex(m => m.id === id);
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === regionMods.length - 1)) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const currentOrder = regionMods[idx].module_order;
    const swapOrder = regionMods[swapIdx].module_order;

    // If both had identical orders, adjust by offset
    const newCurrentOrder = swapOrder;
    const newSwapOrder = currentOrder === swapOrder ? currentOrder + (direction === "up" ? 1 : -1) : currentOrder;

    await supabase.from("training_modules").update({ module_order: newCurrentOrder }).eq("id", regionMods[idx].id);
    await supabase.from("training_modules").update({ module_order: newSwapOrder }).eq("id", regionMods[swapIdx].id);

    fetchModules();
  };

  const openEdit = (mod: TrainingModule) => {
    setEditingModule(mod);
    setForm({
      title: mod.title,
      description: mod.description || "",
      script_content: mod.script_content || "",
      video_url: mod.video_url || "",
      duration_minutes: mod.duration_minutes || 25,
      is_active: mod.is_active,
      region: mod.region === "Nigeria" ? "NG" : mod.region === "USA" ? "US" : mod.region,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingModule(null);
    setForm({
      title: "",
      description: "",
      script_content: "",
      video_url: "",
      duration_minutes: 25,
      is_active: true,
      region: "all",
    });
  };

  const speakScript = (id: string, text: string) => {
    if (!("speechSynthesis" in window)) {
      toast.error("Text-to-speech is not supported in this browser");
      return;
    }

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      toast.info("Audio narration paused");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
    toast.success("Playing script audio narration...");
  };

  // Filtered modules
  const filteredModules = useMemo(() => {
    return modules.filter(m => {
      // Region tab filter
      if (selectedRegionTab === "global") {
        if (m.region !== "all" && m.region !== "US" && m.region !== "USA") return false;
      } else if (selectedRegionTab === "nigeria") {
        if (m.region !== "NG" && m.region !== "Nigeria") return false;
      }

      // Status filter
      if (statusFilter === "active" && !m.is_active) return false;
      if (statusFilter === "inactive" && m.is_active) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = m.title.toLowerCase().includes(q);
        const matchesDesc = (m.description || "").toLowerCase().includes(q);
        const matchesScript = (m.script_content || "").toLowerCase().includes(q);
        const matchesRegion = m.region.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesScript && !matchesRegion) return false;
      }

      return true;
    });
  }, [modules, selectedRegionTab, statusFilter, searchQuery]);

  // Counts
  const totalCount = modules.length;
  const activeCount = modules.filter(m => m.is_active).length;
  const globalCount = modules.filter(m => m.region === "all" || m.region === "US" || m.region === "USA").length;
  const nigeriaCount = modules.filter(m => m.region === "NG" || m.region === "Nigeria").length;
  const totalMinutes = modules.reduce((sum, m) => sum + (m.duration_minutes || 0), 0);

  const getRegionBadge = (region: string) => {
    if (region === "NG" || region === "Nigeria") {
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-medium flex items-center gap-1">
          <span>🇳🇬</span> Nigeria Road Curriculum
        </Badge>
      );
    }
    if (region === "US" || region === "USA") {
      return (
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300 font-medium flex items-center gap-1">
          <span>🇺🇸</span> US Region
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 font-medium flex items-center gap-1">
        <span>🌐</span> Global (All Regions)
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card className="p-6 border-slate-200 shadow-sm bg-gradient-to-r from-slate-50 via-white to-slate-50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight">Training Module Management</h2>
                <Badge variant="secondary" className="font-semibold">
                  {totalCount} Courses Loaded
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Manage mandatory driver safety curriculums, scripts, videos, duration, and regional compliance requirements for Global and Nigerian drivers.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchModules}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Link to="/admin/training-review">
              <Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Review Driver Submissions
              </Button>
            </Link>

            {/* Restore Default Modules Dialog */}
            <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
                  <RotateCcw className="h-4 w-4" />
                  Restore Default Modules
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Restore Default Driver Training Modules?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      This will verify and restore the 8 official driver safety modules into your database:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-foreground/80 font-medium">
                      <li>4 Global / US Modules (Defensive Driving, Safety Systems, Maintenance, Emergency Response)</li>
                      <li>4 Nigeria Road Modules (Nigerian Highway Code, Local Hazards, Overheating/Floods, Breakdown Safety)</li>
                    </ul>
                    <p className="text-xs">
                      Any existing module scripts and regional configurations will be safely synchronized to full default state without deleting driver completion records.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRestoreDefaults} disabled={restoring} className="gap-2">
                    {restoring ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    {restoring ? "Restoring..." : "Confirm & Restore (8 Modules)"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Add Custom Module Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Add Module
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingModule ? "Edit Training Module" : "Create New Training Module"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <Label className="text-xs font-semibold">Module Title *</Label>
                    <Input 
                      value={form.title} 
                      onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} 
                      placeholder="e.g. Defensive Driving: The Five Keys" 
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Course Description</Label>
                    <Textarea 
                      value={form.description} 
                      onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} 
                      placeholder="Summary of learning objectives and key takeaways..." 
                      rows={2} 
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">Regional Curriculum *</Label>
                      <Select value={form.region} onValueChange={v => setForm(prev => ({ ...prev, region: v }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">🌐 All Regions / Global Curriculum</SelectItem>
                          <SelectItem value="NG">🇳🇬 Nigeria (NG Road Curriculum)</SelectItem>
                          <SelectItem value="US">🇺🇸 United States (US Curriculum)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Determines which drivers are assigned this module upon verification.
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Estimated Duration (Minutes)</Label>
                      <Input 
                        type="number" 
                        value={form.duration_minutes} 
                        onChange={e => setForm(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))} 
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs font-semibold">Comprehensive Training Script</Label>
                      <label className="cursor-pointer">
                        <input type="file" accept=".txt,.md,.doc,.docx" className="hidden" onChange={handleScriptUpload} />
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                          <span><Upload className="h-3 w-3" /> Upload Script File</span>
                        </Button>
                      </label>
                    </div>
                    <Textarea 
                      value={form.script_content} 
                      onChange={e => setForm(prev => ({ ...prev, script_content: e.target.value }))} 
                      placeholder="Paste training course narration, slides, study guides, and review quiz instructions..." 
                      rows={8} 
                      className="mt-1 font-mono text-xs leading-relaxed"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {form.script_content ? `${form.script_content.length} characters • ~${Math.ceil(form.script_content.split(/\s+/).length / 140)} min reading time` : "No script entered"}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs font-semibold">Video Media URL</Label>
                      <label className="cursor-pointer">
                        <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={uploading} asChild>
                          <span><Upload className="h-3 w-3" /> {uploading ? "Uploading..." : "Upload MP4 Video"}</span>
                        </Button>
                      </label>
                    </div>
                    <Input 
                      value={form.video_url} 
                      onChange={e => setForm(prev => ({ ...prev, video_url: e.target.value }))} 
                      placeholder="https://... or upload video directly" 
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold">Module Visibility & Active Status</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Inactive modules are hidden from driver portals during enrollment.
                      </p>
                    </div>
                    <Switch checked={form.is_active} onCheckedChange={v => setForm(prev => ({ ...prev, is_active: v }))} />
                  </div>
                </div>

                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave}>{editingModule ? "Update Module" : "Create Module"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t">
          <div className="p-3 rounded-lg bg-white border">
            <p className="text-xs text-muted-foreground font-medium">Total Courses</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{totalCount}</p>
          </div>
          <div className="p-3 rounded-lg bg-white border">
            <p className="text-xs text-muted-foreground font-medium">Active Status</p>
            <p className="text-xl font-bold text-emerald-600 mt-0.5">{activeCount} Active</p>
          </div>
          <div className="p-3 rounded-lg bg-white border">
            <p className="text-xs text-muted-foreground font-medium">Nigeria Road Track</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{nigeriaCount} Courses</p>
          </div>
          <div className="p-3 rounded-lg bg-white border">
            <p className="text-xs text-muted-foreground font-medium">Total Curriculum Length</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{totalMinutes} Mins</p>
          </div>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <Card className="p-4 border-slate-200">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Region Tabs */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant={selectedRegionTab === "all_regions" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRegionTab("all_regions")}
              className="text-xs h-8"
            >
              All Curriculums ({totalCount})
            </Button>
            <Button
              variant={selectedRegionTab === "global" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRegionTab("global")}
              className="text-xs h-8 gap-1.5"
            >
              <span>🌐</span> Global / US Track ({globalCount})
            </Button>
            <Button
              variant={selectedRegionTab === "nigeria" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRegionTab("nigeria")}
              className="text-xs h-8 gap-1.5"
            >
              <span>🇳🇬</span> Nigeria Road Track ({nigeriaCount})
            </Button>
          </div>

          {/* Search and Status Filters */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search modules, scripts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-8 text-xs w-28">
                <SlidersHorizontal className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Modules List */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm font-medium">Loading training modules...</p>
        </div>
      ) : filteredModules.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <GraduationCap className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <h4 className="text-base font-semibold">No Training Modules Found</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            {searchQuery
              ? `No modules matched your search "${searchQuery}". Try clearing filters.`
              : "No modules found in the current selection. You can restore the 8 official driver training courses with one click."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {searchQuery && (
              <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                Clear Search
              </Button>
            )}
            <Button size="sm" onClick={handleRestoreDefaults} disabled={restoring} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Restore 8 Default Modules
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredModules.map((mod, idx) => (
            <Card 
              key={mod.id} 
              className={`p-4 transition-all hover:shadow-sm border ${!mod.is_active ? "opacity-70 bg-slate-50" : "bg-card"}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Reorder Buttons */}
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-foreground" 
                      onClick={() => handleReorder(mod.id, "up")}
                      title="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-foreground" 
                      onClick={() => handleReorder(mod.id, "down")}
                      title="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Order Chip */}
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex flex-col items-center justify-center text-primary shrink-0">
                    <span className="text-[10px] uppercase font-bold text-primary/70 leading-none">Order</span>
                    <span className="text-sm font-extrabold leading-tight">{mod.module_order}</span>
                  </div>

                  {/* Content Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-sm text-foreground hover:text-primary transition-colors">
                        {mod.title}
                      </h4>
                      {getRegionBadge(mod.region)}
                      {!mod.is_active && (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </div>

                    {mod.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {mod.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
                      {mod.duration_minutes ? (
                        <span className="flex items-center gap-1 font-medium text-foreground/80">
                          <Clock className="h-3 w-3 text-primary" /> {mod.duration_minutes} mins
                        </span>
                      ) : null}

                      {mod.script_content && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3 text-slate-500" />
                          Script: {mod.script_content.length > 500 ? `${Math.round(mod.script_content.length / 1000)}k chars` : `${mod.script_content.length} chars`}
                        </span>
                      )}

                      {mod.video_url && (
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <Video className="h-3 w-3" /> Video Linked
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center justify-end gap-1.5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                  {/* Quick Active Toggle */}
                  <div className="flex items-center gap-2 mr-2">
                    <Switch
                      checked={mod.is_active}
                      onCheckedChange={() => handleToggleActive(mod)}
                      title={mod.is_active ? "Click to deactivate" : "Click to activate"}
                    />
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 px-2.5 text-xs gap-1"
                    onClick={() => setPreviewModule(mod)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </Button>

                  {mod.script_content && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-8 w-8 ${speakingId === mod.id ? "text-primary bg-primary/10 animate-pulse" : "text-muted-foreground"}`}
                      onClick={() => speakScript(mod.id, mod.script_content!)}
                      title={speakingId === mod.id ? "Stop Audio" : "Listen (Text-to-speech)"}
                    >
                      {speakingId === mod.id ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  )}

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(mod)}
                    title="Edit Module"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(mod.id, mod.title)}
                    title="Delete Module"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Module Preview Dialog */}
      <Dialog open={!!previewModule} onOpenChange={() => { setPreviewModule(null); window.speechSynthesis?.cancel(); setSpeakingId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {previewModule && getRegionBadge(previewModule.region)}
              {previewModule?.duration_minutes && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="h-3 w-3" /> {previewModule.duration_minutes} minutes
                </Badge>
              )}
            </div>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 mt-1">
              <GraduationCap className="h-5 w-5 text-primary shrink-0" />
              {previewModule?.title}
            </DialogTitle>
          </DialogHeader>

          {previewModule && (
            <div className="space-y-4 mt-2">
              {previewModule.description && (
                <div className="p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Course Overview: </span>
                  {previewModule.description}
                </div>
              )}

              {previewModule.video_url && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold flex items-center gap-2 text-foreground">
                    <Video className="h-4 w-4 text-primary" /> Training Video Media
                  </h4>
                  <div className="rounded-lg overflow-hidden border bg-black aspect-video flex items-center justify-center">
                    <video controls className="w-full h-full" src={previewModule.video_url} />
                  </div>
                </div>
              )}

              {previewModule.script_content && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold flex items-center gap-2 text-foreground">
                      <FileText className="h-4 w-4 text-primary" /> Complete Course Script & Curriculum
                    </h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-xs gap-1" 
                      onClick={() => speakScript(previewModule.id, previewModule.script_content!)}
                    >
                      {speakingId === previewModule.id ? <VolumeX className="h-3.5 w-3.5 text-red-500" /> : <Volume2 className="h-3.5 w-3.5" />}
                      {speakingId === previewModule.id ? "Stop Audio" : "Listen (TTS)"}
                    </Button>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto border border-slate-800">
                    {previewModule.script_content}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setPreviewModule(null)}>Close</Button>
            {previewModule && (
              <Button 
                onClick={() => {
                  const m = previewModule;
                  setPreviewModule(null);
                  openEdit(m);
                }}
                className="gap-1.5"
              >
                <Edit2 className="h-4 w-4" /> Edit Module
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
