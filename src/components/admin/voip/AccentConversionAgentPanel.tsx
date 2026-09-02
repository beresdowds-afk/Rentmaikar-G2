import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Zap,
  Globe,
  Radio,
  Settings,
  History,
  Languages,
  Headphones,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { UseAccentConversionAgentResult } from '@/hooks/useAccentConversionAgent';
import { AMERICAN_ACCENT_PROFILES, AmericanVoiceId } from '@/types/accent-conversion';
import { toast } from 'sonner';

interface AccentConversionAgentPanelProps {
  agent: UseAccentConversionAgentResult;
}

const SAMPLE_ACCENT_TESTS = [
  {
    title: "Traffic & Delay",
    original: "I am coming right now, hold up is heavy on the motorway, put off your engine and wait at the junction.",
    expected: "I'll be right with you, there is heavy traffic on the freeway, turn off the engine and wait at the intersection.",
  },
  {
    title: "Document Verification",
    original: "Please borrow me your particulars so I can verify your vehicle inspection and driver licence.",
    expected: "Please lend me your vehicle registration documents so I can verify your vehicle inspection and driver license.",
  },
  {
    title: "Customer Greeting & Inquiry",
    original: "Good morning sir, can you hear me well? I want to rub minds concerning your rental booking.",
    expected: "Good morning, can you hear me clearly? I'd like to discuss your rental booking.",
  },
  {
    title: "Fleet Dispatch",
    original: "The driver is on ground with a tear-rubber car. Enter the motor and have a safe journey.",
    expected: "The driver is on site with a brand new vehicle. Get in the vehicle and have safe travels.",
  },
];

export const AccentConversionAgentPanel: React.FC<AccentConversionAgentPanelProps> = ({ agent }) => {
  const [activeTab, setActiveTab] = useState('playground');
  const [typedInput, setTypedInput] = useState('');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const handleTestSample = async (text: string) => {
    await agent.speakPhrase(text);
  };

  const handlePreviewVoice = async (id: AmericanVoiceId) => {
    setPreviewingVoice(id);
    await agent.previewProfile(id);
    setPreviewingVoice(null);
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    await agent.speakPhrase(typedInput);
    setTypedInput('');
  };

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <Card className="border-2 border-indigo-500/40 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-background shadow-md">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">
                  🇺🇸 American Accent Voice Conversion Agent
                </h2>
                <Badge className="bg-indigo-600 text-white text-xs px-2.5 py-0.5">
                  Real-Time Low Latency AI
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm max-w-2xl">
                Automatically transforms local speech accents, regional phrasing, and intonations of Admin calls into authentic American English in real-time with sub-200ms latency.
              </p>
            </div>

            {/* Quick Action Activation Switch */}
            <div className="flex items-center gap-4 bg-background/80 p-4 rounded-xl border shadow-sm">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider block">
                  Agent Engine Status
                </span>
                <span className="font-bold text-base flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      agent.isListening ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
                    }`}
                  />
                  {agent.isSpeaking
                    ? 'Speaking American Voice'
                    : agent.isListening
                    ? 'Active (Listening & Converting)'
                    : 'Standby / Paused'}
                </span>
              </div>
              <Button
                size="lg"
                variant={agent.isListening ? 'default' : 'outline'}
                onClick={agent.toggleAgent}
                className={`font-semibold h-11 px-5 ${
                  agent.isListening
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow'
                    : 'border-indigo-400 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950'
                }`}
              >
                {agent.isListening ? (
                  <>
                    <Mic className="h-5 w-5 mr-2 text-emerald-300 animate-pulse" />
                    Agent Active
                  </>
                ) : (
                  <>
                    <Radio className="h-5 w-5 mr-2 text-indigo-600" />
                    Activate Agent
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Real-Time Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t">
            <div>
              <span className="text-xs text-muted-foreground">Active American Persona</span>
              <p className="font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                <span>{agent.activeProfile.gender === 'female' ? '👩' : '👨'}</span>
                {agent.activeProfile.name}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Conversion Latency</span>
              <p className="font-semibold text-sm flex items-center gap-1.5 mt-0.5 font-mono text-emerald-600">
                <Zap className="h-4 w-4 text-amber-500" />
                ~{agent.latencyMs} ms
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Idiom Adaptation</span>
              <p className="font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                <Languages className="h-4 w-4 text-blue-500" />
                {agent.settings.idiomAdaptation ? 'Enabled (Auto-Normalize)' : 'Disabled'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Call Audio Isolation</span>
              <p className="font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                <Headphones className="h-4 w-4 text-indigo-500" />
                {agent.settings.muteOriginalMicOnCall ? 'Mute Raw Mic to Caller' : 'Pass-through'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Feature Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="playground" className="text-xs sm:text-sm">
            🎙️ Live Testing Lab
          </TabsTrigger>
          <TabsTrigger value="voices" className="text-xs sm:text-sm">
            🗣️ American Voices ({agent.profiles.length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs sm:text-sm">
            ⚙️ Agent Tuning
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">
            📜 Conversion Logs ({agent.segments.length})
          </TabsTrigger>
        </TabsList>

        {/* ---------------- PLAYGROUND TAB ---------------- */}
        <TabsContent value="playground" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Mic Test & Visualizer */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mic className="h-5 w-5 text-indigo-600" />
                      Live Microphone Accent Converter
                    </CardTitle>
                    <CardDescription>
                      Speak directly into your microphone to hear your speech converted into the active American voice
                    </CardDescription>
                  </div>
                  {agent.isListening && (
                    <div className="flex items-end gap-1 h-6 px-2.5 py-1 bg-muted rounded-md border">
                      {agent.audioLevels.map((lvl, idx) => (
                        <span
                          key={idx}
                          className="w-1.5 rounded-t bg-indigo-600 transition-all duration-75"
                          style={{ height: `${Math.max(15, lvl * 100)}%` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Visual Speaking State Box */}
                <div className="p-4 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-500/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Live Accent Conversion Monitor
                    </span>
                    <Badge variant={agent.isListening ? 'default' : 'outline'} className="text-xs">
                      {agent.isSpeaking
                        ? '🔊 Audio Output Active'
                        : agent.isListening
                        ? '🎙️ Ready & Listening'
                        : 'Mic Idle'}
                    </Badge>
                  </div>

                  {agent.currentOriginal || agent.currentAmerican ? (
                    <div className="space-y-2 p-3 bg-background rounded-lg border shadow-sm">
                      {agent.currentOriginal && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Admin Speech (Raw):</span>
                          <p className="text-sm font-medium italic">{agent.currentOriginal}</p>
                        </div>
                      )}
                      {agent.currentAmerican && (
                        <div className="pt-2 border-t">
                          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold block">
                            🇺🇸 Converted American Voice:
                          </span>
                          <p className="text-base font-bold text-foreground">{agent.currentAmerican}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center space-y-2">
                      <div className="mx-auto w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
                        {agent.isListening ? (
                          <Mic className="h-6 w-6 animate-pulse" />
                        ) : (
                          <MicOff className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-sm font-medium">
                        {agent.isListening
                          ? 'Speak now — your voice will convert into an authentic American accent!'
                          : 'Microphone is currently paused. Click "Activate Agent" above or speak a test phrase below.'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Uses {agent.activeProfile.name} · {agent.activeProfile.accentType}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                    <span>
                      Listening language: <strong>English (US / Nigerian / Global)</strong>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={agent.clearSegments}
                      className="h-7 text-xs"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Reset Monitor
                    </Button>
                  </div>
                </div>

                {/* Manual Text Tester */}
                <form onSubmit={handleCustomSubmit} className="space-y-2 pt-2">
                  <Label className="text-xs font-semibold">Or Test Any Custom Sentence:</Label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={typedInput}
                      onChange={(e) => setTypedInput(e.target.value)}
                      placeholder="e.g. I am coming right now, hold up is heavy on the motorway..."
                      className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                    <Button
                      type="submit"
                      disabled={!typedInput.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <Volume2 className="h-4 w-4 mr-1.5" /> Convert & Speak
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Quick Test Scenarios */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  Preset Accent Conversion Tests
                </CardTitle>
                <CardDescription>
                  Tap any scenario to test real-time accent normalization and American voice synthesis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {SAMPLE_ACCENT_TESTS.map((test, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{test.title}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestSample(test.original)}
                        className="h-7 px-2.5 text-[11px] bg-background border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      >
                        <Play className="h-3 w-3 mr-1" /> Test Voice
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-[10px] uppercase">Input:</span> "{test.original}"
                      </p>
                      <p className="text-indigo-700 dark:text-indigo-300 font-medium">
                        <span className="font-semibold text-[10px] uppercase">🇺🇸 American:</span> "{test.expected}"
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- VOICES TAB ---------------- */}
        <TabsContent value="voices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-5 w-5 text-indigo-600" />
                American Voice Personas & Regional Accents
              </CardTitle>
              <CardDescription>
                Select which American accent profile will represent you when placing or answering calls
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agent.profiles.map((profile) => {
                  const isSelected = agent.settings.activeProfileId === profile.id;
                  const isAuditioning = previewingVoice === profile.id;

                  return (
                    <div
                      key={profile.id}
                      className={`p-4 rounded-xl border-2 transition-all space-y-3 ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-500/10 shadow-sm'
                          : 'border-border bg-card hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg">
                              {profile.gender === 'female' ? '👩' : '👨'}
                            </span>
                            <span className="font-bold text-sm text-foreground">
                              {profile.name}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {profile.accentType}
                          </Badge>
                        </div>
                        {isSelected ? (
                          <Badge className="bg-indigo-600 text-white text-[11px]">
                            Active Profile
                          </Badge>
                        ) : null}
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {profile.description}
                      </p>

                      <div className="p-2 rounded bg-muted/40 text-[11px] text-muted-foreground italic">
                        "{profile.samplePhrase}"
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePreviewVoice(profile.id)}
                          disabled={isAuditioning}
                          className="flex-1 h-8 text-xs"
                        >
                          {isAuditioning ? (
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5 mr-1.5 text-indigo-600" />
                          )}
                          Audition Voice
                        </Button>
                        <Button
                          size="sm"
                          variant={isSelected ? 'secondary' : 'default'}
                          onClick={() => {
                            agent.updateSettings({ activeProfileId: profile.id });
                            toast.success(`Active profile set to ${profile.name}`);
                          }}
                          className={`h-8 text-xs ${
                            isSelected ? 'bg-indigo-200 text-indigo-900 font-semibold' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Use Voice'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- SETTINGS TAB ---------------- */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-5 w-5 text-indigo-600" />
                Agent Pipeline & Audio Fine-Tuning
              </CardTitle>
              <CardDescription>
                Customize speech rate, pitch, idiom conversion, and call audio isolation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Idiom & Phrasing Configuration */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">Phrasing & Localization</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="setting-idiom" className="font-medium text-sm">
                        Smart Idiom Normalization
                      </Label>
                      <Switch
                        id="setting-idiom"
                        checked={agent.settings.idiomAdaptation}
                        onCheckedChange={(checked) =>
                          agent.updateSettings({ idiomAdaptation: checked })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Automatically translates Nigerian and Commonwealth English phrases (e.g., "I am coming" ➔ "I'll be right with you", "flash me" ➔ "give me a call", "particulars" ➔ "registration documents") into natural American corporate vocabulary.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="setting-autospeak" className="font-medium text-sm">
                        Real-Time Clause Streaming
                      </Label>
                      <Switch
                        id="setting-autospeak"
                        checked={agent.settings.autoSpeakClauses}
                        onCheckedChange={(checked) =>
                          agent.updateSettings({ autoSpeakClauses: checked })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Speaks converted sentences immediately upon detecting clause boundaries without waiting for prolonged pauses.
                    </p>
                  </div>
                </div>
              </div>

              {/* Call Audio Routing & Isolation */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Call Audio Routing & Mic Isolation</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="setting-ducking" className="font-medium text-sm">
                        Caller Mic Isolation (Ducking)
                      </Label>
                      <Switch
                        id="setting-ducking"
                        checked={agent.settings.muteOriginalMicOnCall}
                        onCheckedChange={(checked) =>
                          agent.updateSettings({ muteOriginalMicOnCall: checked })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Automatically suppresses your physical microphone audio from reaching the caller while the American voice is speaking, guaranteeing the caller only hears crystal-clear American pronunciation.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="setting-monitoring" className="font-medium text-sm">
                        Headphone Audio Monitoring
                      </Label>
                      <Switch
                        id="setting-monitoring"
                        checked={agent.settings.monitorAudioFeedback}
                        onCheckedChange={(checked) =>
                          agent.updateSettings({ monitorAudioFeedback: checked })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Plays the synthesized American speech into your headset so you can hear exactly how your words sound to the other party.
                    </p>
                  </div>
                </div>
              </div>

              {/* Pitch & Rate Sliders */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Cadence & Voice Modulation</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <Label>Speech Rate</Label>
                      <span className="font-mono">{agent.settings.speechRate.toFixed(2)}x</span>
                    </div>
                    <Slider
                      value={[agent.settings.speechRate]}
                      min={0.8}
                      max={1.3}
                      step={0.02}
                      onValueChange={([val]) => agent.updateSettings({ speechRate: val })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Adjust talking speed (Standard American conversation is ~1.02x)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <Label>Voice Pitch</Label>
                      <span className="font-mono">{agent.settings.speechPitch.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[agent.settings.speechPitch]}
                      min={0.85}
                      max={1.2}
                      step={0.02}
                      onValueChange={([val]) => agent.updateSettings({ speechPitch: val })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Fine-tune tonal pitch height
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- HISTORY TAB ---------------- */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-5 w-5 text-indigo-600" />
                    Accent Conversion Activity History
                  </CardTitle>
                  <CardDescription>
                    Review recent phrases converted during your calls and sessions
                  </CardDescription>
                </div>
                {agent.segments.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={agent.clearSegments}
                    className="h-8 text-xs"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Clear History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {agent.segments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">No speech conversion records logged yet in this session.</p>
                  <p className="text-xs mt-1">Speak into your mic or test a phrase above to see live records.</p>
                </div>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto">
                  {agent.segments.map((seg) => (
                    <div key={seg.id} className="py-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span>{new Date(seg.timestamp).toLocaleTimeString()}</span>
                          {seg.idiomAdapted && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                              Idiom Adapted
                            </Badge>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{seg.latencyMs} ms</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => agent.speakPhrase(seg.americanText)}
                            className="h-6 px-2 text-[10px]"
                          >
                            <Play className="h-2.5 w-2.5 mr-1" /> Replay
                          </Button>
                        </div>
                      </div>
                      <p className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                        <span>🇺🇸</span>
                        {seg.americanText}
                      </p>
                      <p className="text-muted-foreground pl-5 italic">
                        Raw Input: "{seg.originalText}"
                      </p>
                      {seg.adaptedPhrases && seg.adaptedPhrases.length > 0 && (
                        <div className="pl-5 flex items-center gap-2 text-[10px] text-blue-600 flex-wrap">
                          <span className="font-semibold">Replacements:</span>
                          {seg.adaptedPhrases.map((r, i) => (
                            <span key={i} className="bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200">
                              "{r.original}" ➔ "{r.american}"
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
