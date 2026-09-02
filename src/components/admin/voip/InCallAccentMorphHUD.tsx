import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Zap,
  Globe,
  Radio,
  Sliders,
  Play,
  RotateCcw,
  Headphones,
  CheckCircle2,
} from 'lucide-react';
import { UseAccentConversionAgentResult } from '@/hooks/useAccentConversionAgent';
import { AmericanVoiceId } from '@/types/accent-conversion';

interface InCallAccentMorphHUDProps {
  agent: UseAccentConversionAgentResult;
  className?: string;
  isCallActive?: boolean;
}

const QUICK_CALL_PHRASES = [
  { label: '👋 Greeting', text: "Hello! Thank you for calling Rentmaikar support. How can I help you today?" },
  { label: '⏳ Verification', text: "I'm checking your rental agreement and vehicle documentation right now." },
  { label: '🚗 Inspection', text: "Your vehicle inspection has been verified and approved by our team." },
  { label: '📍 Dispatch', text: "Your assigned driver is en route and will arrive at your location shortly." },
  { label: '🤝 Closing', text: "Is there anything else I can help you with regarding your booking today?" },
];

export const InCallAccentMorphHUD: React.FC<InCallAccentMorphHUDProps> = ({
  agent,
  className = '',
  isCallActive = false,
}) => {
  const [customPhrase, setCustomPhrase] = useState('');
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);

  const handleSpeakCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPhrase.trim()) return;
    await agent.speakPhrase(customPhrase);
    setCustomPhrase('');
  };

  return (
    <div className={`rounded-xl border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 via-background to-purple-500/5 p-4 shadow-sm space-y-3 ${className}`}>
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <span>🇺🇸</span> Real-Time American Accent Agent
              </span>
              <Badge
                variant={agent.isListening ? 'default' : 'secondary'}
                className={`text-[10px] px-2 py-0.5 ${
                  agent.isListening
                    ? 'bg-emerald-600 text-white font-medium animate-pulse'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {agent.isSpeaking
                  ? '🗣️ Speaking American'
                  : agent.isListening
                  ? '🎙️ Listening & Converting'
                  : 'Inactive'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Converts your microphone speech into a natural American accent in real-time
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* Audio Visualizer Spectrum */}
          {agent.isListening && (
            <div className="flex items-end gap-0.5 h-5 px-2 py-1 bg-background/80 rounded border">
              {agent.audioLevels.map((lvl, idx) => (
                <span
                  key={idx}
                  className="w-1 rounded-t bg-indigo-500 transition-all duration-75"
                  style={{ height: `${Math.max(20, lvl * 100)}%` }}
                />
              ))}
            </div>
          )}

          {/* Latency Gauge */}
          <Badge variant="outline" className="text-[11px] gap-1 font-mono">
            <Zap className="h-3 w-3 text-amber-500" />
            <span>{agent.latencyMs}ms</span>
          </Badge>

          {/* Agent Activation Toggle Button */}
          <Button
            size="sm"
            variant={agent.isListening ? 'default' : 'outline'}
            onClick={agent.toggleAgent}
            className={`h-8 text-xs font-semibold ${
              agent.isListening
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                : 'border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950'
            }`}
          >
            {agent.isListening ? (
              <>
                <Mic className="h-3.5 w-3.5 mr-1 text-emerald-300 animate-pulse" />
                Agent Active
              </>
            ) : (
              <>
                <Radio className="h-3.5 w-3.5 mr-1 text-indigo-600" />
                Enable Accent Agent
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Profile & Settings Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t text-xs">
        {/* Voice Persona Selector */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Globe className="h-3 w-3 text-indigo-500" />
            American Accent Persona
          </Label>
          <Select
            value={agent.settings.activeProfileId}
            onValueChange={(val: AmericanVoiceId) =>
              agent.updateSettings({ activeProfileId: val })
            }
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agent.profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.gender === 'female' ? '👩' : '👨'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Idiom Normalization Toggle */}
        <div className="flex items-center justify-between p-2 rounded-md border bg-background/50">
          <div className="space-y-0.5">
            <Label className="text-[11px] font-medium cursor-pointer" htmlFor="idiom-toggle">
              Smart Idiom Adaptation
            </Label>
            <p className="text-[10px] text-muted-foreground">Adapts regional phrasing</p>
          </div>
          <Switch
            id="idiom-toggle"
            checked={agent.settings.idiomAdaptation}
            onCheckedChange={(checked) => agent.updateSettings({ idiomAdaptation: checked })}
            className="scale-75"
          />
        </div>

        {/* Mic Ducking Toggle */}
        <div className="flex items-center justify-between p-2 rounded-md border bg-background/50">
          <div className="space-y-0.5">
            <Label className="text-[11px] font-medium cursor-pointer" htmlFor="ducking-toggle">
              Caller Mic Isolation
            </Label>
            <p className="text-[10px] text-muted-foreground">Suppresses raw mic on call</p>
          </div>
          <Switch
            id="ducking-toggle"
            checked={agent.settings.muteOriginalMicOnCall}
            onCheckedChange={(checked) =>
              agent.updateSettings({ muteOriginalMicOnCall: checked })
            }
            className="scale-75"
          />
        </div>

        {/* Headphone Monitoring Toggle */}
        <div className="flex items-center justify-between p-2 rounded-md border bg-background/50">
          <div className="space-y-0.5">
            <Label className="text-[11px] font-medium cursor-pointer" htmlFor="monitor-toggle">
              Headset Monitoring
            </Label>
            <p className="text-[10px] text-muted-foreground">Hear American playback</p>
          </div>
          <Switch
            id="monitor-toggle"
            checked={agent.settings.monitorAudioFeedback}
            onCheckedChange={(checked) =>
              agent.updateSettings({ monitorAudioFeedback: checked })
            }
            className="scale-75"
          />
        </div>
      </div>

      {/* Live Dual Transcription Stream */}
      <div className="rounded-lg border bg-background/80 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-1.5">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-indigo-600 dark:text-indigo-400">
            Real-Time Speech Stream
          </span>
          <div className="flex items-center gap-2">
            {agent.duckMic && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                Mic Ducked to Caller
              </Badge>
            )}
            <button
              onClick={agent.clearSegments}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              <RotateCcw className="h-2.5 w-2.5" /> Clear
            </button>
          </div>
        </div>

        {/* Real-time active utterance preview */}
        {(agent.currentOriginal || agent.currentAmerican) ? (
          <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20 space-y-1">
            {agent.currentOriginal && (
              <div className="text-xs">
                <span className="font-semibold text-muted-foreground mr-1.5">Admin (Detecting):</span>
                <span className="italic">{agent.currentOriginal}</span>
              </div>
            )}
            {agent.currentAmerican && (
              <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                <span className="font-semibold mr-1.5">🇺🇸 American Accent (Live):</span>
                <span>{agent.currentAmerican}</span>
              </div>
            )}
          </div>
        ) : agent.isListening ? (
          <div className="py-2 text-center text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            Speak naturally into your microphone... words will be converted to an American accent in real-time.
          </div>
        ) : (
          <div className="py-1 text-center text-xs text-muted-foreground">
            Activate the American Accent Agent to convert live calls into natural American pronunciation.
          </div>
        )}

        {/* Segment History */}
        {agent.segments.length > 0 && (
          <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1 divide-y">
            {agent.segments.slice(0, 5).map((seg) => (
              <div key={seg.id} className="pt-1.5 text-xs space-y-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Converted
                    {seg.idiomAdapted && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-600 border-blue-200">
                        Idiom Adapted
                      </Badge>
                    )}
                  </span>
                  <span className="font-mono">{seg.latencyMs}ms</span>
                </div>
                <p className="text-foreground font-medium flex items-center gap-1.5">
                  <span className="text-[11px]">🇺🇸</span>
                  {seg.americanText}
                </p>
                <p className="text-muted-foreground text-[11px] pl-4">
                  Original: "{seg.originalText}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Response American Soundboard */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowQuickPhrases(!showQuickPhrases)}
            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Volume2 className="h-3 w-3" />
            {showQuickPhrases ? 'Hide Quick American Phrases' : 'Show Quick American Voice Responses'}
          </button>
          <span className="text-[10px] text-muted-foreground">Instant 1-click audio injection</span>
        </div>

        {showQuickPhrases && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 pt-1">
            {QUICK_CALL_PHRASES.map((phrase, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={() => agent.speakPhrase(phrase.text)}
                className="h-8 text-xs justify-start px-2 bg-background hover:bg-indigo-50 dark:hover:bg-indigo-950/40 truncate text-left"
                title={phrase.text}
              >
                <Play className="h-3 w-3 mr-1 text-indigo-600 shrink-0" />
                <span className="truncate">{phrase.label}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Custom Phrase Sender */}
      <form onSubmit={handleSpeakCustom} className="flex gap-2 pt-1">
        <input
          type="text"
          value={customPhrase}
          onChange={(e) => setCustomPhrase(e.target.value)}
          placeholder="Type any phrase to speak in American accent..."
          className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!customPhrase.trim()}
          className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
        >
          <Volume2 className="h-3.5 w-3.5 mr-1" />
          Speak in American
        </Button>
      </form>
    </div>
  );
};
