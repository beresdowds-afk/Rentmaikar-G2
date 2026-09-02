import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Volume2, Mic, Square, Upload, Radio, PhoneOff, Phone, RefreshCw, Play, Pause, AlertCircle,
  Trash2, Download, Search, Settings, Save, ListMusic,
} from "lucide-react";
import { toast } from "sonner";
import { useElevenLabsTTS } from "@/hooks/useElevenLabsTTS";
import { useConversation } from "@elevenlabs/react";

const DEFAULT_TTS = "Hello from Rentmaikar. This is an ElevenLabs test message confirming end-to-end audio delivery.";
const FUNCTIONS_BASE = "https://bwvocmhcledbwqlpcswp.functions.supabase.co";

// ---------------- TTS TAB ----------------
function TTSTest({ onLogged }: { onLogged: () => void }) {
  const [text, setText] = useState(DEFAULT_TTS);
  const [voiceId, setVoiceId] = useState("");
  const [region, setRegion] = useState<"US" | "NG">("US");
  const { speak, stop, isLoading, isPlaying, error } = useElevenLabsTTS();

  const handleSpeak = async () => {
    await speak(text, { region, voiceId: voiceId || undefined });
    onLogged();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Sample text</Label>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
        <p className="text-xs text-muted-foreground">{text.length}/5000</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Region preset</Label>
          <select className="w-full h-10 border rounded-md px-3 bg-background" value={region} onChange={(e) => setRegion(e.target.value as "US" | "NG")}>
            <option value="US">US</option>
            <option value="NG">NG</option>
          </select>
        </div>
        <div>
          <Label>Voice ID (optional)</Label>
          <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="Override voice" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSpeak} disabled={isLoading || !text.trim()}>
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Volume2 className="h-4 w-4 mr-2" />}
          Generate & Play
        </Button>
        {isPlaying && (
          <Button variant="outline" onClick={stop}>
            <Square className="h-4 w-4 mr-2" /> Stop
          </Button>
        )}
        {isPlaying && <Badge variant="secondary" className="self-center">Playing…</Badge>}
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
  );
}

// ---------------- STT TAB ----------------
interface TranscriptWord { text: string; start: number; end: number; speaker?: string }
interface TranscriptResult { text: string; words?: TranscriptWord[]; language_code?: string }

function STTTest({ onLogged }: { onLogged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const ext = mime.includes("webm") ? "webm" : "mp4";
        setFile(new File([blob], `recording.${ext}`, { type: mime }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access denied");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const transcribe = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setTranscribing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const form = new FormData();
      form.append("audio", file);
      form.append("diarize", "true");
      form.append("tag_audio_events", "true");
      const res = await fetch(`${FUNCTIONS_BASE}/elevenlabs-stt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      setResult(json);
      toast.success("Transcription complete");
      onLogged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {!recording ? (
          <Button onClick={startRecording} variant="outline"><Mic className="h-4 w-4 mr-2" />Record</Button>
        ) : (
          <Button onClick={stopRecording} variant="destructive"><Square className="h-4 w-4 mr-2" />Stop recording</Button>
        )}
        <label className="inline-flex">
          <Button asChild variant="outline">
            <span><Upload className="h-4 w-4 mr-2" />Upload audio</span>
          </Button>
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <Badge variant="secondary" className="self-center">{file.name} · {(file.size / 1024).toFixed(1)} KB</Badge>}
      </div>
      <Button onClick={transcribe} disabled={!file || transcribing}>
        {transcribing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mic className="h-4 w-4 mr-2" />}
        Transcribe
      </Button>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {result && (
        <Card className="p-4 space-y-2">
          {result.language_code && <Badge>Language: {result.language_code}</Badge>}
          <div>
            <Label>Transcript</Label>
            <Textarea rows={6} readOnly value={result.text} />
          </div>
          {result.words && result.words.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Word timestamps ({result.words.length})</summary>
              <div className="mt-2 max-h-48 overflow-auto text-xs font-mono">
                {result.words.map((w, i) => (
                  <div key={i}>[{w.start.toFixed(2)}–{w.end.toFixed(2)}] {w.speaker ? `<${w.speaker}> ` : ""}{w.text}</div>
                ))}
              </div>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------- VOICE AGENT TAB ----------------
type MicPermState = "unknown" | "granted" | "denied" | "prompt";
const MAX_RECONNECT_ATTEMPTS = 3;

interface AgentTurn { role: "user" | "agent"; text: string; at: number }

function VoiceAgentTest({ onLogged }: { onLogged: () => void }) {
  const [agentId, setAgentId] = useState("");
  const [region, setRegion] = useState<"US" | "NG">("US");
  const [autoSave, setAutoSave] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [transcript, setTranscript] = useState<AgentTurn[]>([]);
  const transcriptRef = useRef<AgentTurn[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const savedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [micState, setMicState] = useState<MicPermState>("unknown");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const shouldReconnectRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const pushTurn = useCallback((role: "user" | "agent", text: string) => {
    const turn: AgentTurn = { role, text, at: Date.now() };
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
  }, []);

  const saveSession = useCallback(async () => {
    if (savedRef.current || transcriptRef.current.length === 0) return;
    setSaving(true);
    try {
      const flat = transcriptRef.current
        .map((t) => `${t.role === "agent" ? "Agent" : "You"}: ${t.text}`)
        .join("\n");
      const duration = startedAtRef.current ? Date.now() - startedAtRef.current : null;
      const { error: rpcError } = await supabase.rpc("save_voice_agent_transcript", {
        _region: region,
        _agent_id: agentId.trim() || null,
        _transcript_text: flat,
        _turns: transcriptRef.current as any,
        _duration_ms: duration,
      });
      if (rpcError) throw rpcError;
      savedRef.current = true;
      toast.success("Voice agent transcript saved");
      onLogged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save transcript");
    } finally {
      setSaving(false);
    }
  }, [agentId, region, onLogged]);

  const conversation = useConversation({
    onConnect: () => {
      setReconnectAttempt(0);
      shouldReconnectRef.current = true;
      if (!startedAtRef.current) startedAtRef.current = Date.now();
      savedRef.current = false;
      toast.success("Voice agent connected");
    },
    onDisconnect: () => {
      toast.info("Voice agent disconnected");
      if (autoSave) void saveSession();
      if (shouldReconnectRef.current && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        const attempt = reconnectAttempt + 1;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        setReconnectAttempt(attempt);
        toast(`Reconnecting… attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);
        reconnectTimerRef.current = window.setTimeout(() => void start(true), delay);
      }
    },
    onError: (err) => {
      const msg = typeof err === "string" ? err : (err as Error)?.message || "Voice agent error";
      setError(msg);
    },
    onMessage: (msg: unknown) => {
      const m = msg as {
        type?: string;
        user_transcription_event?: { user_transcript?: string };
        agent_response_event?: { agent_response?: string };
      };
      if (m.type === "user_transcript" && m.user_transcription_event?.user_transcript) {
        pushTurn("user", m.user_transcription_event.user_transcript);
      } else if (m.type === "agent_response" && m.agent_response_event?.agent_response) {
        pushTurn("agent", m.agent_response_event.agent_response);
      }
    },
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript]);

  useEffect(() => {
    const nav = navigator as Navigator & { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } };
    if (!nav.permissions?.query) return;
    nav.permissions.query({ name: "microphone" as PermissionName })
      .then((status) => {
        setMicState(status.state as MicPermState);
        status.onchange = () => setMicState(status.state as MicPermState);
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => {
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    shouldReconnectRef.current = false;
  }, []);

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState("granted");
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicState("denied");
        setError("Microphone permission denied. Enable it in your browser/device settings, then try again.");
      } else if (name === "NotFoundError") setError("No microphone was detected on this device.");
      else if (name === "NotReadableError") setError("Microphone is in use by another app. Close it and retry.");
      else setError(e instanceof Error ? e.message : "Microphone unavailable");
      return false;
    }
  }, []);

  const start = useCallback(async (isReconnect = false) => {
    setError(null);
    if (!isReconnect) {
      setConnecting(true);
      transcriptRef.current = [];
      setTranscript([]);
      startedAtRef.current = null;
      savedRef.current = false;
    }
    try {
      const gotMic = await requestMic();
      if (!gotMic) return;
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`${FUNCTIONS_BASE}/elevenlabs-agent-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agentId.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      await conversation.startSession({ conversationToken: json.token, connectionType: "webrtc" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect agent");
      shouldReconnectRef.current = false;
    } finally {
      if (!isReconnect) setConnecting(false);
    }
  }, [agentId, conversation, requestMic]);

  const stop = async () => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    await conversation.endSession();
  };

  const isConnected = conversation.status === "connected";

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription className="text-xs">
          Live transcript is captured on-screen. When enabled, the full conversation is saved to <code>elevenlabs_test_logs</code> at the end of the session.
        </AlertDescription>
      </Alert>
      {micState === "denied" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">Microphone is blocked. Enable it in browser/OS settings, then tap "Retry mic access".</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <Button size="sm" variant="outline" onClick={requestMic}>
          <Mic className="h-4 w-4 mr-2" /> Retry mic access
        </Button>
        <Badge variant={micState === "granted" ? "default" : "secondary"}>Mic: {micState}</Badge>
        {reconnectAttempt > 0 && (
          <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Reconnecting {reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS}</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Agent ID (optional)</Label>
          <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent_..." />
        </div>
        <div>
          <Label>Region</Label>
          <select className="w-full h-10 border rounded-md px-3 bg-background" value={region} onChange={(e) => setRegion(e.target.value as "US" | "NG")}>
            <option value="US">US</option>
            <option value="NG">NG</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} className="accent-primary" />
        Auto-save transcript to database at end of session
      </label>
      <div className="flex gap-2 items-center flex-wrap">
        {!isConnected ? (
          <Button onClick={() => start(false)} disabled={connecting}>
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
            Start conversation
          </Button>
        ) : (
          <Button variant="destructive" onClick={stop}>
            <PhoneOff className="h-4 w-4 mr-2" /> End
          </Button>
        )}
        {isConnected && (
          <Badge variant="secondary" className="gap-1"><Radio className="h-3 w-3" />{conversation.isSpeaking ? "Agent speaking" : "Listening"}</Badge>
        )}
        {transcript.length > 0 && (
          <Button size="sm" variant="outline" onClick={saveSession} disabled={saving || savedRef.current}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {savedRef.current ? "Saved" : "Save transcript now"}
          </Button>
        )}
      </div>
      {error && <Alert variant="destructive"><AlertDescription className="text-xs whitespace-pre-line">{error}</AlertDescription></Alert>}
      <Card className="p-4 max-h-80 overflow-auto space-y-2">
        {transcript.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-6">
            {isConnected ? "Listening… speak into the microphone." : "No transcript yet. Start a conversation."}
          </p>
        ) : (
          transcript.map((m, i) => (
            <div key={i} className="text-sm">
              <span className={`font-semibold ${m.role === "agent" ? "text-primary" : "text-muted-foreground"}`}>
                {m.role === "agent" ? "Agent" : "You"}:
              </span>{" "}
              {m.text}
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </Card>
    </div>
  );
}

// ---------------- RECENT RUNS TAB ----------------
interface RunRow {
  id: string;
  kind: "tts" | "stt";
  status: string;
  region: string | null;
  voice_id: string | null;
  model_id: string | null;
  input_text: string | null;
  input_file_name: string | null;
  input_file_size_bytes: number | null;
  transcript_text: string | null;
  language_code: string | null;
  audio_storage_path: string | null;
  audio_bytes: number | null;
  duration_ms: number | null;
  request_metadata: unknown;
  response_metadata: unknown;
  error_message: string | null;
  created_at: string;
  user_id: string | null;
  words: TranscriptWord[] | null;
}

// --- Synced transcript player: click a word (or a highlighted match) to seek ---
function SyncedTranscriptPlayer({
  words,
  search,
  getUrl,
}: {
  words: TranscriptWord[];
  search: string;
  getUrl: () => Promise<string | null>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [rate, setRate] = useState<number>(1);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);

  // Keep <audio>.playbackRate in sync with selected rate whenever it changes or src rebinds
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
  }, [rate, audioUrl]);

  const query = search.trim().toLowerCase();
  const matchIdxs = useMemo(
    () => (query ? words.map((w, i) => (w.text.toLowerCase().includes(query) ? i : -1)).filter((i) => i >= 0) : []),
    [words, query],
  );

  const ensureUrl = useCallback(async () => {
    if (audioUrl) return audioUrl;
    setLoading(true);
    try {
      const url = await getUrl();
      if (!url) { toast.error("No audio available for this run"); return null; }
      setAudioUrl(url);
      return url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load audio");
      return null;
    } finally {
      setLoading(false);
    }
  }, [audioUrl, getUrl]);

  const seekTo = useCallback(async (seconds: number, idx: number) => {
    const url = await ensureUrl();
    if (!url) return;
    // Wait a tick for <audio src> to bind if just set
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const el = audioRef.current;
    if (!el) return;
    try {
      if (el.readyState < 1) {
        await new Promise<void>((resolve) => {
          const on = () => { el.removeEventListener("loadedmetadata", on); resolve(); };
          el.addEventListener("loadedmetadata", on);
        });
      }
      // Pause first so the seek isn't chased by in-flight decoded frames at the old rate
      if (!el.paused) el.pause();
      el.currentTime = Math.max(0, seconds);
      // Wait for the seek to actually land so playback resumes at the correct offset
      if (el.seeking) {
        await new Promise<void>((resolve) => {
          const on = () => { el.removeEventListener("seeked", on); resolve(); };
          el.addEventListener("seeked", on);
        });
      }
      el.playbackRate = rate;
      await el.play();
      setActiveIdx(idx);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Playback failed");
    }
  }, [ensureUrl, rate]);

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    const t = el.currentTime;
    // binary-ish linear scan — words are short lists in practice
    let idx = -1;
    for (let i = 0; i < words.length; i++) {
      if (t >= words[i].start && t <= words[i].end) { idx = i; break; }
      if (words[i].start > t) break;
    }
    if (idx !== activeIdx) {
      setActiveIdx(idx);
      const node = wordRefs.current[idx];
      if (node && scrollerRef.current) {
        const scroller = scrollerRef.current;
        const nr = node.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        if (nr.top < sr.top || nr.bottom > sr.bottom) {
          node.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
  };

  const jumpMatch = (dir: 1 | -1) => {
    if (matchIdxs.length === 0) return;
    const cur = matchIdxs.findIndex((i) => i > activeIdx);
    let target: number;
    if (dir === 1) target = cur === -1 ? matchIdxs[0] : matchIdxs[cur];
    else {
      const prev = [...matchIdxs].reverse().find((i) => i < activeIdx);
      target = prev ?? matchIdxs[matchIdxs.length - 1];
    }
    void seekTo(words[target].start, target);
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ListMusic className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Synced playback</span>
        {matchIdxs.length > 0 && (
          <>
            <Badge variant="secondary" className="text-[10px]">{matchIdxs.length} match{matchIdxs.length === 1 ? "" : "es"} for "{search}"</Badge>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => jumpMatch(-1)}>Prev</Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => jumpMatch(1)}>Next</Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Label className="text-[10px] text-muted-foreground">Speed</Label>
          <select
            value={rate}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRate(v);
              const el = audioRef.current;
              if (el) el.playbackRate = v;
            }}
            className="h-6 rounded border bg-background px-1 text-xs"
          >
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={async () => {
              const url = await ensureUrl();
              if (!url) return;
              const el = audioRef.current;
              if (!el) return;
              if (el.paused) { el.playbackRate = rate; await el.play(); } else { el.pause(); }
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : playing ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            {playing ? "Pause" : "Play"}
          </Button>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        controls
        className="w-full h-8"
        onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).playbackRate = rate; }}
        onPlay={(e) => { (e.currentTarget as HTMLAudioElement).playbackRate = rate; setPlaying(true); }}
        onRateChange={(e) => {
          // If the user changes speed via the native controls, mirror it into React state
          const v = (e.currentTarget as HTMLAudioElement).playbackRate;
          if (v !== rate) setRate(v);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setActiveIdx(-1); }}
        onTimeUpdate={onTimeUpdate}
      />
      <div
        ref={scrollerRef}
        className="max-h-40 overflow-auto text-xs leading-6 p-1 rounded bg-background border"
      >
        {words.map((w, i) => {
          const isMatch = query && w.text.toLowerCase().includes(query);
          const isActive = i === activeIdx;
          return (
            <span
              key={i}
              ref={(el) => { wordRefs.current[i] = el; }}
              onClick={() => seekTo(w.start, i)}
              title={`${w.start.toFixed(2)}s${w.speaker ? ` · ${w.speaker}` : ""}`}
              className={[
                "cursor-pointer px-0.5 rounded transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "",
                !isActive && isMatch ? "bg-yellow-300 text-black" : "",
                !isActive && !isMatch ? "hover:bg-muted" : "",
              ].join(" ")}
            >
              {w.text}{/\s/.test(w.text) ? "" : " "}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function highlight(text: string | null | undefined, query: string): React.ReactNode {
  if (!text) return text;
  if (!query.trim()) return text;
  try {
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? <mark key={i} className="bg-yellow-300 text-black rounded px-0.5">{p}</mark> : <span key={i}>{p}</span>
    );
  } catch {
    return text;
  }
}

function RecentRuns({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "tts" | "stt">("all");
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [audioDays, setAudioDays] = useState(30);
  const [transcriptDays, setTranscriptDays] = useState(90);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("elevenlabs_test_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("kind", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else setRows((data ?? []) as unknown as RunRow[]);
    setLoading(false);
  }, [filter]);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from("elevenlabs_retention_settings").select("*").limit(1).maybeSingle();
    if (data) {
      setAudioDays(data.audio_retention_days);
      setTranscriptDays(data.transcript_retention_days);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.input_text, r.transcript_text, r.input_file_name, r.error_message, r.voice_id, r.model_id, r.language_code, r.region]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const getSignedUrl = async (row: RunRow): Promise<string | null> => {
    if (!row.audio_storage_path) return null;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const res = await fetch(`${FUNCTIONS_BASE}/elevenlabs-test-audio-url`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ logId: row.id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to sign audio URL");
    return json.url as string;
  };

  const playAudio = async (row: RunRow) => {
    setPlayingId(row.id);
    try {
      const url = await getSignedUrl(row);
      if (!url) return toast.error("No audio saved for this run");
      const audio = new Audio(url);
      await audio.play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Playback failed");
    } finally {
      setPlayingId(null);
    }
  };

  const deleteRow = async (row: RunRow) => {
    setDeletingId(row.id);
    try {
      const { error } = await supabase.rpc("admin_delete_elevenlabs_test_log", { _log_id: row.id });
      if (error) throw error;
      toast.success("Log deleted");
      onChanged();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const saveRetention = async () => {
    try {
      const { error } = await supabase.rpc("admin_update_elevenlabs_retention", {
        _audio_days: audioDays,
        _transcript_days: transcriptDays,
      });
      if (error) throw error;
      toast.success("Retention updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const runPurgeNow = async () => {
    setPurging(true);
    try {
      const { data, error } = await supabase.rpc("purge_expired_elevenlabs_test_logs");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(`Purged ${row?.logs_deleted ?? 0} rows · ${row?.audio_deleted ?? 0} audio files`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setPurging(false);
    }
  };

  const exportRows = async (fmt: "csv" | "json") => {
    const augmented = await Promise.all(filteredRows.map(async (r) => {
      let signed_audio_url: string | null = null;
      if (r.audio_storage_path) {
        try { signed_audio_url = await getSignedUrl(r); } catch { /* ignore per row */ }
      }
      return { ...r, signed_audio_url };
    }));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let blob: Blob;
    let name: string;
    if (fmt === "json") {
      blob = new Blob([JSON.stringify(augmented, null, 2)], { type: "application/json" });
      name = `elevenlabs-test-logs-${stamp}.json`;
    } else {
      const headers = [
        "id","kind","status","region","voice_id","model_id","language_code","input_file_name",
        "input_file_size_bytes","duration_ms","audio_bytes","audio_storage_path","signed_audio_url",
        "input_text","transcript_text","error_message","created_at","user_id",
      ];
      const esc = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, " ");
        return `"${s}"`;
      };
      const lines = [
        headers.join(","),
        ...augmented.map((r) => headers.map((h) => esc((r as any)[h])).join(",")),
      ];
      blob = new Blob([lines.join("\n")], { type: "text/csv" });
      name = `elevenlabs-test-logs-${stamp}.csv`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${augmented.length} rows`);
  };

  return (
    <div className="space-y-3">
      {/* Retention settings */}
      <Card className="p-3 space-y-2 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Settings className="h-4 w-4" /> Retention policy
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <Label className="text-xs">Audio kept for (days)</Label>
            <Input type="number" min={1} value={audioDays} onChange={(e) => setAudioDays(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Transcripts kept for (days)</Label>
            <Input type="number" min={1} value={transcriptDays} onChange={(e) => setTranscriptDays(Number(e.target.value))} />
          </div>
          <Button size="sm" onClick={saveRetention} variant="outline">Save policy</Button>
          <Button size="sm" onClick={runPurgeNow} disabled={purging} variant="secondary">
            {purging ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Trash2 className="h-3 w-3 mr-2" />}
            Purge expired now
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Automatic purge runs daily at 03:15 UTC. Audio is deleted after {audioDays} day(s); full log rows after {transcriptDays} day(s).
        </p>
      </Card>

      {/* Filters + export */}
      <div className="flex gap-2 items-center flex-wrap">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="h-9 border rounded-md px-3 bg-background text-sm"
        >
          <option value="all">All runs</option>
          <option value="tts">TTS only</option>
          <option value="stt">STT / Agent</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-9"
            placeholder="Search transcripts, input text, filenames, errors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportRows("csv")}><Download className="h-3 w-3 mr-1" />CSV</Button>
        <Button size="sm" variant="outline" onClick={() => exportRows("json")}><Download className="h-3 w-3 mr-1" />JSON</Button>
        <span className="text-xs text-muted-foreground">{filteredRows.length} / {rows.length} runs</span>
      </div>

      <div className="border rounded-md divide-y max-h-[520px] overflow-auto">
        {filteredRows.length === 0 && !loading && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {search ? `No runs match "${search}".` : "No test runs yet."}
          </div>
        )}
        {filteredRows.map((r) => {
          const meta = (r.request_metadata as { source?: string } | null) ?? {};
          return (
            <div key={r.id} className="p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={r.kind === "tts" ? "default" : "secondary"}>{r.kind.toUpperCase()}</Badge>
                  {meta.source === "voice_agent" && <Badge variant="outline">Voice Agent</Badge>}
                  <Badge variant={r.status === "success" ? "outline" : "destructive"}>{r.status}</Badge>
                  {r.language_code && <Badge variant="secondary">{r.language_code}</Badge>}
                  {r.region && <Badge variant="secondary">{r.region}</Badge>}
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  {r.duration_ms != null && <span className="text-xs text-muted-foreground">{r.duration_ms}ms</span>}
                </div>
                <div className="flex items-center gap-1">
                  {r.audio_storage_path && (
                    <Button size="sm" variant="ghost" onClick={() => playAudio(r)} disabled={playingId === r.id}>
                      {playingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      <span className="ml-1 text-xs">Play</span>
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={deletingId === r.id}>
                        {deletingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this log?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently removes the log row{r.audio_storage_path ? " and its stored audio" : ""}. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteRow(r)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {r.input_text && (
                <div className="text-xs text-muted-foreground line-clamp-3"><b>Input:</b> {highlight(r.input_text, search)}</div>
              )}
              {r.input_file_name && (
                <div className="text-xs text-muted-foreground">
                  <b>File:</b> {highlight(r.input_file_name, search)} ({r.input_file_size_bytes ? (r.input_file_size_bytes / 1024).toFixed(1) + " KB" : "—"})
                </div>
              )}
              {r.transcript_text && (
                <div className="text-xs line-clamp-4"><b>Transcript:</b> {highlight(r.transcript_text, search)}</div>
              )}
              {r.words && r.words.length > 0 && r.audio_storage_path && (
                <SyncedTranscriptPlayer
                  words={r.words}
                  search={search}
                  getUrl={() => getSignedUrl(r)}
                />
              )}
              {r.error_message && (
                <div className="text-xs text-destructive line-clamp-3"><b>Error:</b> {highlight(r.error_message, search)}</div>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Request/Response metadata</summary>
                <pre className="mt-1 bg-muted rounded p-2 overflow-auto max-h-40 text-[10px]">
{JSON.stringify({ request: r.request_metadata, response: r.response_metadata, voice_id: r.voice_id, model_id: r.model_id, audio_path: r.audio_storage_path }, null, 2)}
                </pre>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- ROOT PANEL ----------------
export const ElevenLabsTestPanel = () => {
  const [refreshToken, setRefreshToken] = useState(0);
  const bumpRefresh = () => setRefreshToken((n) => n + 1);

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">ElevenLabs Test Panel</h3>
        <p className="text-sm text-muted-foreground">
          Verify TTS, STT, and Conversational Voice Agent end-to-end. Every TTS/STT run and saved voice-agent session lands in the database for admin review.
        </p>
      </div>
      <Tabs defaultValue="tts">
        <TabsList>
          <TabsTrigger value="tts">Text-to-Speech</TabsTrigger>
          <TabsTrigger value="stt">Speech-to-Text</TabsTrigger>
          <TabsTrigger value="agent">Voice Agent</TabsTrigger>
          <TabsTrigger value="runs">Recent runs</TabsTrigger>
        </TabsList>
        <TabsContent value="tts" className="pt-4"><TTSTest onLogged={bumpRefresh} /></TabsContent>
        <TabsContent value="stt" className="pt-4"><STTTest onLogged={bumpRefresh} /></TabsContent>
        <TabsContent value="agent" className="pt-4"><VoiceAgentTest onLogged={bumpRefresh} /></TabsContent>
        <TabsContent value="runs" className="pt-4"><RecentRuns refreshToken={refreshToken} onChanged={bumpRefresh} /></TabsContent>
      </Tabs>
    </Card>
  );
};

export default ElevenLabsTestPanel;
