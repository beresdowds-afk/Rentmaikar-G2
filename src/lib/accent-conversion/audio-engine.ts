/**
 * Real-Time Audio Engine for American Accent Voice Conversion
 *
 * Provides real-time speech synthesis, audio routing, Web Audio analysis,
 * and outbound call injection.
 */

import { AmericanAccentProfile, AMERICAN_ACCENT_PROFILES } from "@/types/accent-conversion";
import { supabase } from "@/integrations/supabase/client";

export class AccentAudioEngine {
  private audioCtx: AudioContext | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isSpeaking = false;
  private speakingCallbacks: Array<(speaking: boolean) => void> = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private audioQueue: string[] = [];
  private isProcessingQueue = false;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  public async initAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.destinationNode = this.audioCtx.createMediaStreamDestination();
      this.gainNode = this.audioCtx.createGain();
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 64;

      this.gainNode.connect(this.destinationNode);
      this.gainNode.connect(this.analyserNode);
      // Connect to audio destination for local admin feedback monitoring
      this.gainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  public getOutboundMediaStream(): MediaStream | null {
    return this.destinationNode?.stream || null;
  }

  public setMonitoringVolume(volume: number) {
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.audioCtx.currentTime);
    }
  }

  public onSpeakingChange(cb: (speaking: boolean) => void): () => void {
    this.speakingCallbacks.push(cb);
    return () => {
      this.speakingCallbacks = this.speakingCallbacks.filter(c => c !== cb);
    };
  }

  private notifySpeaking(speaking: boolean) {
    this.isSpeaking = speaking;
    this.speakingCallbacks.forEach(cb => cb(speaking));
  }

  public getAudioLevels(): number[] {
    if (!this.analyserNode) return [0, 0, 0, 0, 0, 0, 0, 0];
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(dataArray);

    // Pick 8 representative bars
    const bars: number[] = [];
    const step = Math.floor(bufferLength / 8);
    for (let i = 0; i < 8; i++) {
      bars.push((dataArray[i * step] || 0) / 255);
    }
    return bars;
  }

  /**
   * Speak text in real-time using American Accent Voice.
   * Priority: Web Speech API (low latency: <100ms) with ElevenLabs high-def fallback.
   */
  public async speakAmericanVoice(
    text: string,
    profile: AmericanAccentProfile,
    options: {
      rate?: number;
      pitch?: number;
      preferHighFidelity?: boolean;
    } = {}
  ): Promise<void> {
    if (!text.trim()) return;

    await this.initAudioContext();
    this.audioQueue.push(text);
    if (!this.isProcessingQueue) {
      await this.processQueue(profile, options);
    }
  }

  private async processQueue(
    profile: AmericanAccentProfile,
    options: {
      rate?: number;
      pitch?: number;
      preferHighFidelity?: boolean;
    }
  ) {
    if (this.audioQueue.length === 0) {
      this.isProcessingQueue = false;
      this.notifySpeaking(false);
      return;
    }

    this.isProcessingQueue = true;
    const textToSpeak = this.audioQueue.shift()!;
    this.notifySpeaking(true);

    if (options.preferHighFidelity) {
      const elevenLabsSuccess = await this.tryElevenLabsTTS(textToSpeak, profile);
      if (!elevenLabsSuccess) {
        await this.speakViaWebSpeech(textToSpeak, profile, options);
      }
    } else {
      await this.speakViaWebSpeech(textToSpeak, profile, options);
    }

    // Process next queued phrase
    await this.processQueue(profile, options);
  }

  private async tryElevenLabsTTS(text: string, profile: AmericanAccentProfile): Promise<boolean> {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return false;

      const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
      const res = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voiceId: profile.elevenLabsVoiceId,
          region: 'US',
        }),
      });

      if (!res.ok) return false;
      const audioBlob = await res.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();
      if (!this.audioCtx) await this.initAudioContext();

      const audioBuffer = await this.audioCtx!.decodeAudioData(arrayBuffer);
      const source = this.audioCtx!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode!);

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start(0);
      });

      return true;
    } catch {
      return false;
    }
  }

  private speakViaWebSpeech(
    text: string,
    profile: AmericanAccentProfile,
    options: { rate?: number; pitch?: number }
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        this.notifySpeaking(false);
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      // Locate an American English voice
      const voices = window.speechSynthesis.getVoices();
      const usVoice =
        voices.find(v => v.lang === 'en-US' && v.name.toLowerCase().includes(profile.name.split(' ')[0].toLowerCase())) ||
        voices.find(v => v.lang === 'en-US' && profile.preferredWebSpeechName && v.name.includes(profile.preferredWebSpeechName)) ||
        voices.find(v => v.lang === 'en-US' && (profile.gender === 'female' ? /female|zira|samantha|karen|susan/i.test(v.name) : /male|david|alex|fred/i.test(v.name))) ||
        voices.find(v => v.lang === 'en-US') ||
        voices.find(v => v.lang.startsWith('en'));

      if (usVoice) {
        utterance.voice = usVoice;
      }

      utterance.rate = options.rate ?? profile.rate;
      utterance.pitch = options.pitch ?? profile.pitch;

      utterance.onstart = () => {
        this.notifySpeaking(true);
      };

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = () => {
        this.currentUtterance = null;
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  public stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.audioQueue = [];
    this.isProcessingQueue = false;
    this.notifySpeaking(false);
  }

  public destroy() {
    this.stopSpeaking();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }
}

let singletonEngine: AccentAudioEngine | null = null;
export function getAccentAudioEngine(): AccentAudioEngine {
  if (!singletonEngine) {
    singletonEngine = new AccentAudioEngine();
  }
  return singletonEngine;
}
