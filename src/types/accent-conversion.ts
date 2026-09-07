/**
 * Types for the real-time American accent conversion agent used on admin VoIP calls.
 */

export type AccentPersonaId =
  | 'rachel'
  | 'adam'
  | 'sarah'
  | 'christopher'
  | 'emily'
  | 'brian';

export interface AccentPersona {
  id: AccentPersonaId;
  /** Display name shown in the UI. */
  name: string;
  /** Short American-accent style description. */
  style: string;
  /** ElevenLabs voice id used for synthesis. */
  voiceId: string;
}

/** American voice personas available to admins. */
export const ACCENT_PERSONAS: AccentPersona[] = [
  { id: 'rachel', name: 'Rachel', style: 'General American — crisp, standard pronunciation', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
  { id: 'adam', name: 'Adam', style: 'Corporate American — confident, professional baritone', voiceId: 'JBFqnCBsd6RMkjVDRZzb' },
  { id: 'sarah', name: 'Sarah', style: 'West Coast — warm, approachable conversational tone', voiceId: 'FGY2WhTYpPnrIDTdsKH5' },
  { id: 'christopher', name: 'Christopher', style: 'Executive American — authoritative corporate cadence', voiceId: 'iP95p4xoKVk53GoZ742B' },
  { id: 'emily', name: 'Emily', style: 'Customer support — empathetic, high-trust tone', voiceId: 'cgSgspJ2msm6clMCkdW9' },
  { id: 'brian', name: 'Brian', style: 'Midwestern neutral — calm, unaccented delivery', voiceId: 'nPczCjzI2devNBz1zQrb' },
];

export const DEFAULT_PERSONA_ID: AccentPersonaId = 'rachel';

export interface AccentAgentSettings {
  personaId: AccentPersonaId;
  /** Playback rate multiplier applied to the synthesised audio (0.8 – 1.3). */
  speechRate: number;
  /** Monitor volume in the admin headset (0 – 1). */
  monitorVolume: number;
  /** Duck (mute) the raw microphone while the converted voice plays. */
  duckMicrophone: boolean;
  /** Speak each finished clause instead of waiting for a full sentence. */
  clauseStreaming: boolean;
}

export const DEFAULT_ACCENT_SETTINGS: AccentAgentSettings = {
  personaId: DEFAULT_PERSONA_ID,
  speechRate: 1,
  monitorVolume: 0.9,
  duckMicrophone: true,
  clauseStreaming: true,
};

export type AccentAgentStatus =
  | 'idle'
  | 'listening'
  | 'converting'
  | 'speaking'
  | 'paused'
  | 'error';

export interface AccentTurn {
  id: string;
  at: number;
  /** Raw text recognised from the admin microphone. */
  spoken: string;
  /** Normalised American-English text sent to the voice engine. */
  converted: string;
  /** Idioms/phrases replaced during normalisation. */
  replacements: string[];
  status: 'converting' | 'spoken' | 'failed';
  error?: string;
}
