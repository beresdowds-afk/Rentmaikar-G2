import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Mic, MicOff, Play, Sparkles, Trash2 } from 'lucide-react';
import { useAccentConversionAgent, type AccentConversionAgent } from '@/hooks/useAccentConversionAgent';

const AUDITION_LINE =
  'Good afternoon, this is RentMaikar. I am calling about your vehicle pickup and your registration documents.';

interface Props {
  /** Share an existing agent (e.g. the call-centre instance) or run standalone. */
  agent?: AccentConversionAgent;
}

/** Accent Agent studio: audition the microphone, pick a persona and tune output. */
export const AccentConversionAgentPanel = ({ agent: shared }: Props) => {
  const own = useAccentConversionAgent();
  const agent = shared ?? own;
  const { settings } = agent;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            American Accent Agent
          </CardTitle>
          <CardDescription>
            Speak into your microphone and hear your words returned in a natural American accent.
            Conversion pauses automatically if microphone access is lost or synthesis fails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => agent.toggle()}
              disabled={!agent.supported}
              variant={agent.isActive ? 'destructive' : 'default'}
            >
              {agent.isActive ? <MicOff className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
              {agent.isActive ? 'Stop conversion' : 'Start microphone conversion'}
            </Button>
            <Button variant="outline" onClick={() => void agent.speakPhrase(AUDITION_LINE)}>
              <Play className="h-4 w-4 mr-2" />
              Audition {agent.persona.name}
            </Button>
            <Badge variant={agent.status === 'error' ? 'destructive' : 'secondary'} className="capitalize">
              {agent.status}
            </Badge>
            {agent.turns.length > 0 && (
              <Button variant="ghost" size="sm" onClick={agent.clearTurns}>
                <Trash2 className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          {!agent.supported && (
            <p className="text-sm text-muted-foreground">
              Live microphone conversion requires Chrome or Edge. Persona auditioning still works here.
            </p>
          )}
          {agent.error && (
            <p className="text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {agent.error}
            </p>
          )}

          <Separator />

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Conversion feed</p>
            {agent.interim && <p className="text-sm italic text-muted-foreground mb-2">{agent.interim}</p>}
            {agent.turns.length === 0 && !agent.interim && (
              <p className="text-sm text-muted-foreground italic">Nothing captured yet.</p>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {[...agent.turns].reverse().map((t) => (
                <div key={t.id} className="rounded border p-2 text-sm">
                  <p className="text-muted-foreground">{t.spoken}</p>
                  <p className={t.status === 'failed' ? 'text-destructive' : 'text-foreground'}>
                    → {t.converted}
                  </p>
                  {t.replacements.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t.replacements.join(' · ')}
                    </p>
                  )}
                  {t.error && <p className="text-[11px] text-destructive mt-1">{t.error}</p>}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voice persona & tuning</CardTitle>
          <CardDescription>Applies to live calls and auditions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {agent.personas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => agent.setPersona(p.id)}
                className={`w-full text-left rounded border p-2 transition-colors ${
                  settings.personaId === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.style}</div>
              </button>
            ))}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs">Speech rate — {settings.speechRate.toFixed(2)}x</Label>
            <Slider
              min={0.8}
              max={1.3}
              step={0.05}
              value={[settings.speechRate]}
              onValueChange={([v]) => agent.updateSettings({ speechRate: v })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Monitor volume — {Math.round(settings.monitorVolume * 100)}%</Label>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[settings.monitorVolume]}
              onValueChange={([v]) => agent.updateSettings({ monitorVolume: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="duck-mic" className="text-xs">Duck raw microphone while speaking</Label>
            <Switch
              id="duck-mic"
              checked={settings.duckMicrophone}
              onCheckedChange={(v) => agent.updateSettings({ duckMicrophone: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="clause-stream" className="text-xs">Clause streaming (lower latency)</Label>
            <Switch
              id="clause-stream"
              checked={settings.clauseStreaming}
              onCheckedChange={(v) => agent.updateSettings({ clauseStreaming: v })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccentConversionAgentPanel;
