import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Headphones, Server, Radio, ShieldCheck } from "lucide-react";
import { TelephonyEngine, TELEPHONY_ENGINE_METADATA } from "@/types/voip";

interface TelephonyEngineSelectorProps {
  currentEngine: TelephonyEngine;
  onChange: (engine: TelephonyEngine) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const TelephonyEngineSelector = ({
  currentEngine,
  onChange,
  disabled = false,
  compact = false,
}: TelephonyEngineSelectorProps) => {
  const getIcon = (engine: TelephonyEngine) => {
    switch (engine) {
      case "SOFTPHONE":
        return <Headphones className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "SERVER_REST":
        return <Server className="h-4 w-4 text-blue-500 shrink-0" />;
      case "TWIML":
        return <Radio className="h-4 w-4 text-purple-500 shrink-0" />;
    }
  };

  const getBadgeVariant = (engine: TelephonyEngine) => {
    switch (engine) {
      case "SOFTPHONE":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "SERVER_REST":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "TWIML":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-lg border border-border/60">
        {(["SOFTPHONE", "SERVER_REST", "TWIML"] as TelephonyEngine[]).map((engine) => {
          const isSelected = currentEngine === engine;
          const meta = TELEPHONY_ENGINE_METADATA[engine];
          return (
            <button
              key={engine}
              type="button"
              disabled={disabled}
              onClick={() => onChange(engine)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                isSelected
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {getIcon(engine)}
              <span>{meta.badge}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold tracking-tight">Active Calling Engine</Label>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            Harmonised Control
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">Admin Preference</span>
      </div>

      <RadioGroup
        value={currentEngine}
        onValueChange={(val) => onChange(val as TelephonyEngine)}
        disabled={disabled}
        className="grid grid-cols-1 md:grid-cols-3 gap-2.5"
      >
        {(["SOFTPHONE", "SERVER_REST", "TWIML"] as TelephonyEngine[]).map((engine) => {
          const isSelected = currentEngine === engine;
          const meta = TELEPHONY_ENGINE_METADATA[engine];

          return (
            <div
              key={engine}
              onClick={() => !disabled && onChange(engine)}
              className={`relative flex flex-col justify-between p-3.5 rounded-lg border transition-all cursor-pointer select-none ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border/80 hover:border-border hover:bg-muted/30"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {getIcon(engine)}
                  <span className="text-sm font-medium leading-none">{meta.label}</span>
                </div>
                <RadioGroupItem value={engine} id={`engine-${engine}`} className="mt-0.5" />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {meta.description}
              </p>

              <div>
                <Badge variant="outline" className={`text-[11px] font-normal border ${getBadgeVariant(engine)}`}>
                  {meta.badge}
                </Badge>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
};
