// PORTABLE MODULE - no imports, no runtime-specific APIs.
// Identical copies live at:
//   backend/src/services/endCallPolicy.ts
//   supabase/functions/_shared/end-call-policy.ts
// A vitest parity test (src/test/endCallPolicy.test.ts) fails if they diverge.
//
// Contract (returned by both the Node backend and the end-voip-call edge
// function; HTTP status is always 200 for policy outcomes):
//   { success: boolean, message: string, callId?: string, status?: string }
// success=true  : call confirmed terminal, already terminal, Twilio 404
//                 (reconciled as failed), or reconcileOnly with a live call.
// success=false : no SID, lookup failure, no status, termination rejected,
//                 confirmation failure / non-terminal, local sync failure.

export interface EndCallResult {
  success: boolean;
  message: string;
  callId?: string;
  status?: string;
}

export interface EndCallRecord {
  id: string;
  callSid?: string | null;
  callType?: string | null;
}

export interface EndCallInput {
  callId?: string;
  callSid?: string;
  reconcileOnly?: boolean;
}

export interface ProviderLookup {
  ok: boolean;
  status: number;
  providerStatus?: string;
}

export interface LocalSync {
  callId?: string;
  callSid: string;
  status: string;
}

export interface EndCallDeps {
  loadRecord(input: { callId?: string; callSid?: string }): Promise<EndCallRecord | null>;
  getProviderCall(sid: string): Promise<ProviderLookup>;
  requestTermination(sid: string): Promise<{ ok: boolean; status: number }>;
  terminateConference(callId: string): Promise<void>;
  /** Updates voip_calls (status, ended_at, duration). Must throw on failure. */
  syncCall(update: LocalSync): Promise<void>;
  /** Best-effort update of voip_call_participants. Must not be required. */
  syncParticipants(callId: string): Promise<void>;
  warn(message: string, detail?: unknown): void;
}

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);

export function mapProviderStatus(status: string): string {
  if (status === "queued" || status === "ringing") return "ringing";
  if (status === "in-progress") return "in-progress";
  if (TERMINAL_STATUSES.has(status)) return status;
  return "in-progress";
}

export async function runEndCall(
  input: EndCallInput,
  deps: EndCallDeps
): Promise<EndCallResult> {
  let record: EndCallRecord | null = null;
  try {
    record = await deps.loadRecord({ callId: input.callId, callSid: input.callSid });
  } catch (e) {
    deps.warn("[End Call] Failed to load call record", e);
  }

  const callId = record?.id || input.callId;
  const targetSid = input.callSid || record?.callSid || undefined;

  if (!targetSid) {
    return {
      success: false,
      message: "No authoritative Twilio Call SID is available for this call",
      callId,
    };
  }

  const syncAll = async (status: string): Promise<void> => {
    await deps.syncCall({ callId, callSid: targetSid, status: mapProviderStatus(status) });
    if (callId) {
      try {
        await deps.syncParticipants(callId);
      } catch (e) {
        deps.warn("[End Call] Failed to update participants", e);
      }
    }
  };

  // 1. Verify authoritative provider state first.
  let providerStatus: string;
  try {
    const lookup = await deps.getProviderCall(targetSid);

    if (lookup.status === 404) {
      try {
        await deps.syncCall({ callId, callSid: targetSid, status: "failed" });
      } catch (e) {
        deps.warn("[End Call] Failed to reconcile missing Twilio call", e);
      }
      return {
        success: true,
        message: "Twilio call no longer exists; local call record reconciled",
        callId,
        status: "failed",
      };
    }

    if (!lookup.ok) {
      return {
        success: false,
        message: `Unable to verify Twilio call state (HTTP ${lookup.status})`,
        callId,
      };
    }

    providerStatus = String(lookup.providerStatus || "").toLowerCase();
    if (!providerStatus) {
      return { success: false, message: "Twilio returned no call status", callId };
    }
  } catch (e) {
    deps.warn("[End Call] Twilio state lookup error", e);
    return { success: false, message: "Unable to verify the call with Twilio", callId };
  }

  // 2. Already terminal: synchronize, do not request termination again.
  if (TERMINAL_STATUSES.has(providerStatus)) {
    try {
      await syncAll(providerStatus);
    } catch (e) {
      deps.warn("[End Call] Failed to synchronize terminal call state", e);
    }
    return {
      success: true,
      message: `Call already ended at Twilio with status: ${providerStatus}`,
      callId,
      status: providerStatus,
    };
  }

  // 3. Reconcile-only never terminates a live provider call.
  if (input.reconcileOnly === true) {
    return {
      success: true,
      message: `Call is still active at Twilio with status: ${providerStatus}`,
      callId,
      status: mapProviderStatus(providerStatus),
    };
  }

  // 4. Live: request termination, then confirm before mutating local state.
  try {
    const termination = await deps.requestTermination(targetSid);
    if (!termination.ok) {
      deps.warn(`[End Call] Twilio termination rejected: HTTP ${termination.status}`);
      return {
        success: false,
        message: `Twilio rejected call termination (HTTP ${termination.status})`,
        callId,
      };
    }

    if (callId && record?.callType === "group") {
      try {
        await deps.terminateConference(callId);
      } catch (e) {
        deps.warn("[End Call] Conference termination warning", e);
      }
    }

    const confirmation = await deps.getProviderCall(targetSid);
    if (!confirmation.ok) {
      return {
        success: false,
        message: `Call termination was requested, but Twilio state could not be confirmed (HTTP ${confirmation.status})`,
        callId,
      };
    }

    const confirmedStatus = String(confirmation.providerStatus || "").toLowerCase();
    if (!TERMINAL_STATUSES.has(confirmedStatus)) {
      return {
        success: false,
        message: `Twilio has not confirmed call termination; current status: ${confirmedStatus || "unknown"}`,
        callId,
      };
    }

    try {
      await syncAll(confirmedStatus);
    } catch (e) {
      deps.warn("[End Call] Failed to update local terminal state", e);
      return {
        success: false,
        message: "Twilio ended the call, but local state synchronization failed",
        callId,
      };
    }

    return {
      success: true,
      message: `Call ended successfully; Twilio confirmed status: ${confirmedStatus}`,
      callId,
      status: confirmedStatus,
    };
  } catch (e) {
    deps.warn("[End Call] Twilio REST API termination error", e);
    return { success: false, message: "Unable to terminate the call with Twilio", callId };
  }
}
