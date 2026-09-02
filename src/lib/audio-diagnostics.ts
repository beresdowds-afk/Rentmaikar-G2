/**
 * Lightweight in-memory diagnostics bus for call audio.
 *
 * Records microphone/speaker permission checks and audio routing events per
 * call so developers (and support staff) can see exactly what happened without
 * digging through the browser console.
 */

export type AudioDiagnosticLevel = "info" | "warn" | "error";

export interface AudioDiagnosticEvent {
  id: string;
  at: number;
  callId: string | null;
  category: "permission" | "routing" | "device" | "call";
  level: AudioDiagnosticLevel;
  message: string;
  detail?: Record<string, unknown>;
}

const MAX_EVENTS = 300;

let events: AudioDiagnosticEvent[] = [];
let currentCallId: string | null = null;
const listeners = new Set<(events: AudioDiagnosticEvent[]) => void>();

function emit() {
  const snapshot = events;
  listeners.forEach((l) => l(snapshot));
}

export function setDiagnosticsCallId(callId: string | null) {
  currentCallId = callId;
}

export function getDiagnosticsCallId() {
  return currentCallId;
}

export function logAudioEvent(
  category: AudioDiagnosticEvent["category"],
  message: string,
  options?: { level?: AudioDiagnosticLevel; detail?: Record<string, unknown> },
) {
  const event: AudioDiagnosticEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    callId: currentCallId,
    category,
    level: options?.level ?? "info",
    message,
    detail: options?.detail,
  };
  events = [...events, event].slice(-MAX_EVENTS);
  emit();
}

export function subscribeAudioEvents(listener: (events: AudioDiagnosticEvent[]) => void) {
  listeners.add(listener);
  listener(events);
  return () => {
    listeners.delete(listener);
  };
}

export function getAudioEvents() {
  return events;
}

export function clearAudioEvents() {
  events = [];
  emit();
}

export function exportAudioEvents(): string {
  return JSON.stringify(events, null, 2);
}
