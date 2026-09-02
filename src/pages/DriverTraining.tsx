import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  GraduationCap,
  Video,
  FileText,
  CheckCircle,
  Lock,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";
import SyncedScriptPlayer from "@/components/training/SyncedScriptPlayer";
import { ensureMediaPermissions } from "@/lib/media-permissions";

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
}

const DriverTraining = () => {
  const { country } = useRegion();
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [completions, setCompletions] = useState<string[]>([]);
  const [activeModule, setActiveModule] = useState<TrainingModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [country]);

  // Mic/speaker access is requested at the point of use — right before a module
  // (and its TTS narration) opens — rather than on app start.
  const openModule = async (mod: TrainingModule) => {
    await ensureMediaPermissions();
    setActiveModule(mod);
  };


  // Cancel any lingering speech when leaving a module
  const handleBackToModules = () => {
    window.speechSynthesis.cancel();
    setActiveModule(null);
  };

  const fetchData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);

      const [modulesRes, completionsRes] = await Promise.all([
        supabase
          .from("training_modules")
          .select("*")
          .eq("is_active", true)
          .or(`region.eq.all,region.eq.${country}`)
          .order("module_order"),
        supabase
          .from("training_completions")
          .select("module_id")
          .eq("user_id", user.id),
      ]);

      if (modulesRes.data) setModules(modulesRes.data);
      if (completionsRes.data)
        setCompletions(completionsRes.data.map((c) => c.module_id));
    }
    setLoading(false);
  };

  const completeModule = async (moduleId: string) => {
    if (!userId) return;

    const { error } = await supabase.rpc("complete_training_module", {
      _module_id: moduleId,
    });

    if (error) {
      if (error.code === "23505") {
        toast.info("Module already completed");
      } else {
        toast.error("Failed to mark as complete");
      }
    } else {
      setCompletions((prev) => [...prev, moduleId]);
      toast.success("Module submitted for compliance review ✅");

      if (completions.length + 1 === modules.length) {
        // Refresh schedule is recorded server-side once admins verify every module.
        toast.success(
          "All modules submitted! Your training is pending admin verification.",
          { duration: 5000 }
        );
      }
    }
  };

  const progress =
    modules.length > 0 ? (completions.length / modules.length) * 100 : 0;
  const allComplete =
    modules.length > 0 && completions.length === modules.length;

  const canAccessModule = (index: number) => {
    if (index === 0) return true;
    return completions.includes(modules[index - 1]?.id);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Page Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">
                Driver Training Program
              </h1>
              <p className="text-muted-foreground">
                Complete all modules to start driving. Refresh required every 6
                months.
              </p>
            </div>
          </div>

          {/* Progress Card */}
          <Card className="p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  Training Progress
                </p>
                <p className="text-lg font-bold">
                  {completions.length} of {modules.length} modules completed
                </p>
              </div>
              {allComplete ? (
                <Badge className="bg-green-100 text-green-700 gap-1">
                  <CheckCircle className="h-3 w-3" /> Complete
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> In Progress
                </Badge>
              )}
            </div>
            <Progress value={progress} className="h-3" />
            {allComplete && (
              <p className="text-sm text-green-600 mt-3 flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Next refresh due in 6 months
              </p>
            )}
          </Card>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading training modules…
            </div>
          ) : modules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No training modules available for your region yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Module List ── */}
              {!activeModule &&
                modules.map((mod, idx) => {
                  const isCompleted = completions.includes(mod.id);
                  const isAccessible = canAccessModule(idx);

                  return (
                    <Card
                      key={mod.id}
                      className={`p-4 cursor-pointer transition-all ${
                        isCompleted
                          ? "border-green-200 bg-green-50/50"
                          : isAccessible
                          ? "hover:border-primary/50"
                          : "opacity-50"
                      }`}
                      onClick={() => { if (isAccessible) void openModule(mod); }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                            isCompleted
                              ? "bg-green-100 text-green-700"
                              : isAccessible
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : isAccessible ? (
                            idx + 1
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{mod.title}</p>
                          {mod.description && (
                            <p className="text-sm text-muted-foreground">
                              {mod.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {mod.script_content && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" /> Script + Audio
                              </span>
                            )}
                            {mod.video_url && (
                              <span className="flex items-center gap-1">
                                <Video className="h-3 w-3" /> Video
                              </span>
                            )}
                            {mod.duration_minutes ? (
                              <span>{mod.duration_minutes} min</span>
                            ) : null}
                          </div>
                        </div>
                        {isAccessible && !isCompleted && (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </Card>
                  );
                })}

              {/* ── Active Module View ── */}
              {activeModule && (
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    onClick={handleBackToModules}
                    className="mb-2"
                  >
                    ← Back to modules
                  </Button>

                  <Card className="p-6">
                    <h2 className="text-xl font-bold mb-1">
                      {activeModule.title}
                    </h2>
                    {activeModule.description && (
                      <p className="text-muted-foreground mb-5">
                        {activeModule.description}
                      </p>
                    )}

                    {/* Video */}
                    {activeModule.video_url && (
                      <div className="mb-6">
                        <h3 className="font-medium mb-2 flex items-center gap-2">
                          <Video className="h-4 w-4" /> Training Video
                        </h3>
                        <video
                          controls
                          className="w-full rounded-lg"
                          src={activeModule.video_url}
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    )}

                    {/* Synced TTS Script */}
                    {activeModule.script_content && (
                      <div className="mb-6">
                        <h3 className="font-medium flex items-center gap-2 mb-3">
                          <FileText className="h-4 w-4" /> Training Script
                          <span className="ml-1 text-xs text-muted-foreground font-normal">
                            — press Play to follow along
                          </span>
                        </h3>
                        <SyncedScriptPlayer
                          script={activeModule.script_content}
                        />
                      </div>
                    )}

                    {/* Complete button */}
                    {!completions.includes(activeModule.id) ? (
                      <Button
                        className="w-full gap-2 mt-2"
                        size="lg"
                        onClick={() => completeModule(activeModule.id)}
                      >
                        <CheckCircle className="h-5 w-5" /> Mark as Complete
                      </Button>
                    ) : (
                      <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-center text-green-700 font-medium flex items-center justify-center gap-2">
                        <CheckCircle className="h-5 w-5" /> Module Completed
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DriverTraining;
