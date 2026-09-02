export type AmericanVoiceId =
  | 'us-rachel-general'
  | 'us-adam-corporate'
  | 'us-sarah-california'
  | 'us-christopher-executive'
  | 'us-emily-support'
  | 'us-brian-midwest';

export interface AmericanAccentProfile {
  id: AmericanVoiceId;
  name: string;
  gender: 'female' | 'male';
  accentType: 'General American' | 'West Coast (California)' | 'Mid-Atlantic / Corporate' | 'Midwestern Neutral' | 'Friendly Customer Support';
  description: string;
  elevenLabsVoiceId: string;
  preferredWebSpeechName?: string;
  pitch: number;
  rate: number;
  samplePhrase: string;
}

export const AMERICAN_ACCENT_PROFILES: AmericanAccentProfile[] = [
  {
    id: 'us-rachel-general',
    name: 'Rachel (General American)',
    gender: 'female',
    accentType: 'General American',
    description: 'Crisp, natural standard American accent widely understood across all US regions.',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    preferredWebSpeechName: 'Samantha',
    pitch: 1.0,
    rate: 1.02,
    samplePhrase: "Hello! Thank you for calling Rentmaikar support. I'd be glad to assist you with your rental vehicle today.",
  },
  {
    id: 'us-adam-corporate',
    name: 'Adam (Corporate American)',
    gender: 'male',
    accentType: 'Mid-Atlantic / Corporate',
    description: 'Confident, professional American baritone voice ideal for fleet and partner negotiations.',
    elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
    preferredWebSpeechName: 'Google US English',
    pitch: 0.95,
    rate: 1.0,
    samplePhrase: "Good afternoon. This is Rentmaikar administration reaching out regarding your active agreement terms.",
  },
  {
    id: 'us-sarah-california',
    name: 'Sarah (West Coast / California)',
    gender: 'female',
    accentType: 'West Coast (California)',
    description: 'Warm, engaging, and friendly conversational American accent for customer care.',
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    preferredWebSpeechName: 'Victoria',
    pitch: 1.05,
    rate: 1.03,
    samplePhrase: "Hi there! I'm following up on your recent booking inquiry to make sure everything went smoothly.",
  },
  {
    id: 'us-christopher-executive',
    name: 'Christopher (Executive American)',
    gender: 'male',
    accentType: 'Mid-Atlantic / Corporate',
    description: 'Authoritative, clear American English with polished corporate cadence.',
    elevenLabsVoiceId: 'iP95p4xoKVk53GoZ742B',
    preferredWebSpeechName: 'Alex',
    pitch: 0.98,
    rate: 1.02,
    samplePhrase: "Hello. I am verifying your driver credential verification documents for immediate dispatch approval.",
  },
  {
    id: 'us-emily-support',
    name: 'Emily (Friendly Support)',
    gender: 'female',
    accentType: 'Friendly Customer Support',
    description: 'Empathetic, clear, and welcoming American accent designed for high-trust support calls.',
    elevenLabsVoiceId: 'LcfcDJNUP1GQjkzn1xUU',
    preferredWebSpeechName: 'Google US English',
    pitch: 1.02,
    rate: 1.0,
    samplePhrase: "Thanks for reaching out to Rentmaikar. Let me quickly look up your inspection status on my screen.",
  },
  {
    id: 'us-brian-midwest',
    name: 'Brian (Midwestern Neutral)',
    gender: 'male',
    accentType: 'Midwestern Neutral',
    description: 'Calm, unaccented standard American Midwestern pronunciation.',
    elevenLabsVoiceId: 'nPczCjzI2devNBz1zQrb',
    preferredWebSpeechName: 'Fred',
    pitch: 0.97,
    rate: 0.98,
    samplePhrase: "Good morning. I'm following up on the weekly vehicle check-in schedule for your assigned unit.",
  },
];

export interface AccentConversionSettings {
  enabled: boolean;
  activeProfileId: AmericanVoiceId;
  idiomAdaptation: boolean; // Converts regional idioms (e.g. "I am coming" -> "I'll be right with you")
  muteOriginalMicOnCall: boolean; // Suppresses original admin mic so the remote caller only hears American voice
  monitorAudioFeedback: boolean; // Admin hears the converted American speech in their headset
  feedbackVolume: number; // 0.0 to 1.0
  autoSpeakClauses: boolean; // Real-time automatic sentence/clause streaming
  speechRate: number; // 0.8 to 1.3
  speechPitch: number; // 0.8 to 1.3
  latencyPriority: 'ultra-low' | 'balanced' | 'studio-quality';
}

export const DEFAULT_ACCENT_SETTINGS: AccentConversionSettings = {
  enabled: true,
  activeProfileId: 'us-rachel-general',
  idiomAdaptation: true,
  muteOriginalMicOnCall: true,
  monitorAudioFeedback: true,
  feedbackVolume: 0.8,
  autoSpeakClauses: true,
  speechRate: 1.02,
  speechPitch: 1.0,
  latencyPriority: 'balanced',
};

export interface ConversionSegment {
  id: string;
  timestamp: number;
  originalText: string;
  americanText: string;
  idiomAdapted: boolean;
  adaptedPhrases?: { original: string; american: string }[];
  latencyMs: number;
  status: 'transcribing' | 'converting' | 'speaking' | 'completed' | 'error';
  errorMessage?: string;
}

export type AccentConversionStatus =
  | 'idle'
  | 'listening'
  | 'transforming'
  | 'speaking'
  | 'error'
  | 'unsupported';
