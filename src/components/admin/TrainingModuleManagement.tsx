import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, GraduationCap, Video, FileText, Upload, Volume2, Eye, ArrowUp, ArrowDown } from "lucide-react";

interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  module_order: number;
  script_content: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  region: string;
  created_at: string;
}

export const TrainingModuleManagement = () => {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<TrainingModule | null>(null);
  const [previewModule, setPreviewModule] = useState<TrainingModule | null>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    script_content: "",
    video_url: "",
    duration_minutes: 0,
    is_active: true,
    region: "all",
  });

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    const { data, error } = await supabase
      .from("training_modules")
      .select("*")
      .order("module_order", { ascending: true });

    if (error) {
      toast.error("Failed to load training modules");
    } else {
      setModules(data || []);
    }
    setLoading(false);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 50MB.");
      return;
    }

    setUploading(true);
    const fileName = `${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from("training-media")
      .upload(fileName, file);

    if (error) {
      toast.error("Failed to upload video");
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
          title: form.title,
          description: form.description || null,
          script_content: form.script_content || null,
          video_url: form.video_url || null,
          duration_minutes: form.duration_minutes,
          is_active: form.is_active,
          region: form.region,
        })
        .eq("id", editingModule.id);

      if (error) {
        toast.error("Failed to update module");
      } else {
        toast.success("Module updated");
      }
    } else {
      const maxOrder = modules.length > 0 ? Math.max(...modules.map(m => m.module_order)) + 1 : 0;
      const { error } = await supabase
        .from("training_modules")
        .insert({
          title: form.title,
          description: form.description || null,
          script_content: form.script_content || null,
          video_url: form.video_url || null,
          duration_minutes: form.duration_minutes,
          is_active: form.is_active,
          region: form.region,
          module_order: maxOrder,
        });

      if (error) {
        toast.error("Failed to create module");
      } else {
        toast.success("Module created");
      }
    }

    setDialogOpen(false);
    resetForm();
    fetchModules();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("training_modules").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete module");
    } else {
      toast.success("Module deleted");
      fetchModules();
    }
  };

  const handleReorder = async (id: string, direction: "up" | "down") => {
    const idx = modules.findIndex(m => m.id === id);
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === modules.length - 1)) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const currentOrder = modules[idx].module_order;
    const swapOrder = modules[swapIdx].module_order;

    await supabase.from("training_modules").update({ module_order: swapOrder }).eq("id", modules[idx].id);
    await supabase.from("training_modules").update({ module_order: currentOrder }).eq("id", modules[swapIdx].id);
    fetchModules();
  };

  const openEdit = (mod: TrainingModule) => {
    setEditingModule(mod);
    setForm({
      title: mod.title,
      description: mod.description || "",
      script_content: mod.script_content || "",
      video_url: mod.video_url || "",
      duration_minutes: mod.duration_minutes || 0,
      is_active: mod.is_active,
      region: mod.region,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingModule(null);
    setForm({ title: "", description: "", script_content: "", video_url: "", duration_minutes: 0, is_active: true, region: "all" });
  };

  const speakScript = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
      toast.success("Playing script audio...");
    } else {
      toast.error("Text-to-speech not supported in this browser");
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">Training Module Management</h3>
            <p className="text-sm text-muted-foreground">Create and manage driver training content with scripts and videos</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Module</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingModule ? "Edit Module" : "Create Training Module"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Module title" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description" rows={2} />
              </div>
              <div>
                <Label>Region</Label>
                <Select value={form.region} onValueChange={v => setForm(prev => ({ ...prev, region: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    <SelectItem value="USA">USA</SelectItem>
                    <SelectItem value="Nigeria">Nigeria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input type="number" value={form.duration_minutes} onChange={e => setForm(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Training Script</Label>
                  <label className="cursor-pointer">
                    <input type="file" accept=".txt,.md,.doc,.docx" className="hidden" onChange={handleScriptUpload} />
                    <Button variant="outline" size="sm" className="gap-1" asChild><span><Upload className="h-3 w-3" /> Upload Script</span></Button>
                  </label>
                </div>
                <Textarea value={form.script_content} onChange={e => setForm(prev => ({ ...prev, script_content: e.target.value }))} placeholder="Enter training script content or upload a file..." rows={8} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Video</Label>
                  <label className="cursor-pointer">
                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                    <Button variant="outline" size="sm" className="gap-1" disabled={uploading} asChild>
                      <span><Upload className="h-3 w-3" /> {uploading ? "Uploading..." : "Upload Video"}</span>
                    </Button>
                  </label>
                </div>
                <Input value={form.video_url} onChange={e => setForm(prev => ({ ...prev, video_url: e.target.value }))} placeholder="Video URL or upload above" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(prev => ({ ...prev, is_active: v }))} />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSave} className="w-full">{editingModule ? "Update Module" : "Create Module"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!previewModule} onOpenChange={() => setPreviewModule(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> {previewModule?.title}
            </DialogTitle>
          </DialogHeader>
          {previewModule && (
            <div className="space-y-4 mt-4">
              {previewModule.description && <p className="text-muted-foreground">{previewModule.description}</p>}
              {previewModule.video_url && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2"><Video className="h-4 w-4" /> Video</h4>
                  <video controls className="w-full rounded-lg" src={previewModule.video_url} />
                </div>
              )}
              {previewModule.script_content && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium flex items-center gap-2"><FileText className="h-4 w-4" /> Script</h4>
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => speakScript(previewModule.script_content!)}>
                      <Volume2 className="h-3 w-3" /> Listen
                    </Button>
                  </div>
                  <div className="p-4 rounded-lg bg-muted text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {previewModule.script_content}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading modules...</div>
      ) : modules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No training modules yet. Create your first module to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map((mod, idx) => (
            <div key={mod.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleReorder(mod.id, "up")} disabled={idx === 0}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleReorder(mod.id, "down")} disabled={idx === modules.length - 1}>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {idx + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{mod.title}</p>
                    {!mod.is_active && <Badge variant="secondary">Inactive</Badge>}
                    {mod.region !== "all" && <Badge variant="outline">{mod.region}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    {mod.script_content && <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Script</span>}
                    {mod.video_url && <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Video</span>}
                    {mod.duration_minutes ? <span>{mod.duration_minutes} min</span> : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setPreviewModule(mod)}><Eye className="h-4 w-4" /></Button>
                {mod.script_content && (
                  <Button variant="ghost" size="icon" onClick={() => speakScript(mod.script_content!)}><Volume2 className="h-4 w-4" /></Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => openEdit(mod)}><Edit2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(mod.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
