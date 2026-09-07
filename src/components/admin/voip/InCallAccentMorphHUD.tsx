import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, Mic, Sparkles, Volume2 } from 'lucide-react';
import type { AccentConversionAgent } from '@/hooks/useAccentConversionAgent';

const QUICK_PHRASES: { label: string; text: string }[] = [
  { label: 'Greeting', text: 'Hi, this is RentMaikar support. How can I help you today?' },
  { label: 'Verification', text: 'Before we continue, can you confirm the phone number on your account?' },
  { label: 'Inspection', text: 'Your vehicle inspection is due. Please upload the required photos today.' },
  { label: 'Dispatch', text: 'A driver has been assigned and will be with the vehicle shortly.' },
  { label: 'Closing', text: 'Thanks for your time. I have noted everything and will follow up shortly.' },
];

interface Props {
  agent: AccentConversionAgent;
}

/** Live dual-stream HUD: what the admin said vs. the American-accent output. */
export const InCallAccentMorphHUD = ({ agent }: Props) => {
  const bars = Array.from({ length: 8 });
  const recent = agent.turns.slice(-6).reverse();

  return (
    <div className="mt-4 rounded-md border bg-background/60 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            American accent agent
          </span>
          <Badge variant="outline" className="text-[10px]">{agent.persona.name}</Badge>
          <Badge
            variant={agent.status === 'error' ? 'destructive' : 'secondary'}
            className="text-[10px] capitalize"
          >
            {agent.status === 'speaking' && <Volume2 className="h-2.5 w-2.5 mr-1" />}
            {agent.status === 'converting' && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
            {agent.status}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* Live level meter */}
          <div className="flex items-end gap-0.5 h-4" aria-hidden>
            {bars.map((_, i) => {
              const active = agent.isActive && agent.level * 8 > i;
              return (
                <span
                  key={i}
                  className={`w-1 rounded-sm transition-all ${active ? 'bg-primary' : 'bg-muted'}`}
                  style={{ height: `${4 + i * 1.5}px` }}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <Mic className="h-3 w-3 text-muted-foreground" />
            <Label htmlFor="accent-agent-toggle" className="text-xs cursor-pointer">
              Convert
            </Label>
            <Switch
              id="accent-agent-toggle"
              checked={agent.isActive}
              onCheckedChange={() => agent.toggle()}
              className="scale-75"
            />
          </div>
        </div>
      </div>

      {!agent.supported && (
        <p className="text-xs text-muted-foreground">
          Live conversion needs a Chromium-based browser. Quick phrases below still work.
        </p>
      )}

      {agent.error && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {agent.error}
        </p>
      )}

      {agent.settings.duckMicrophone && agent.status === 'speaking' && (
        <p className="text-[11px] text-muted-foreground">
          Raw microphone ducked — the caller only hears the American voice.
        </p>
      )}

      {/* Dual stream */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border p-2 min-h-[64px]">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">You said</p>
          {agent.interim && <p className="text-xs italic text-muted-foreground">{agent.interim}</p>}
          {recent.map((t) => (
            <p key={`s-${t.id}`} className="text-xs leading-relaxed">{t.spoken}</p>
          ))}
          {!agent.interim && recent.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Waiting for speech…</p>
          )}
        </div>
        <div className="rounded border p-2 min-h-[64px] bg-primary/5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">American output</p>
          {recent.map((t) => (
            <p
              key={`c-${t.id}`}
              className={`text-xs leading-relaxed ${t.status === 'failed' ? 'text-destructive' : ''}`}
            >
              {t.converted}
              {t.replacements.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({t.replacements.length} adjusted)</span>
              )}
            </p>
          ))}
          {recent.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Converted speech appears here.</p>
          )}
        </div>
      </div>

      {/* Soundboard */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_PHRASES.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void agent.speakPhrase(p.text)}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default InCallAccentMorphHUD;
