/**
 * Audio engine for the accent conversion agent.
 *
 * Synthesises American-accent speech through the `elevenlabs-tts` edge
 * function and plays it back with rate / monitor-volume control. Playback is
 * serialised so overlapping clauses never talk over each other.
 */

import { supabase } from '@/integrations/supabase/client';

export interface SynthesisOptions {
  voiceId: string;
  speechRate: number;
  volume: number;
  signal?: AbortSignal;
  /** Optional output device (speaker/headset) selected by the admin. */
  sinkId?: string | null;
}

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

type AudioElementWithSink = HTMLAudioElement & {
  setSinkId?: (id: string) => Promise<void>;
};

export class AccentAudioEngine {
  private current: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private queue: Promise<void> = Promise.resolve();

  /** Synthesise and play one utterance. Resolves once playback ends. */
  speak(text: string, opts: SynthesisOptions): Promise<void> {
    const task = this.queue.then(() => this.run(text, opts)).catch((err) => {
      // Keep the queue alive; surface the error to the caller of this call.
      throw err;
    });
    // Swallow rejection on the internal chain so one failure does not poison it.
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async run(text: string, opts: SynthesisOptions): Promise<void> {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error('Not signed in');

    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voiceId: opts.voiceId, region: 'US' }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Voice synthesis failed (${res.status}): ${body || res.statusText}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    this.currentUrl = url;

    const audio = new Audio(url) as AudioElementWithSink;
    audio.playbackRate = Math.min(1.3, Math.max(0.8, opts.speechRate));
    audio.volume = Math.min(1, Math.max(0, opts.volume));
    if (opts.sinkId && typeof audio.setSinkId === 'function') {
      await audio.setSinkId(opts.sinkId).catch(() => undefined);
    }
    this.current = audio;

    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Audio playback error'));
        if (opts.signal) {
          opts.signal.addEventListener('abort', () => {
            audio.pause();
            resolve();
          }, { once: true });
        }
        void audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
      if (this.currentUrl === url) this.currentUrl = null;
      if (this.current === audio) this.current = null;
    }
  }

  stop() {
    this.current?.pause();
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
    this.current = null;
    this.queue = Promise.resolve();
  }
}
