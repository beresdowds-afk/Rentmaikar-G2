/**
 * RentMaikar Marketing Engine - Twilio Adapter
 * Reuses existing Twilio Voice, VoIP, and Call Center infrastructure for marketing outreach,
 * outbound call initiation to qualified leads, call status polling, call recording association, and webhooks.
 */

import { ProviderStatusInfo, InitiateCallParams } from './types';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

export interface TwilioCallResult {
  ok: boolean;
  callSid?: string;
  status?: string;
  to?: string;
  from?: string;
  leadId?: string;
  error?: string;
  raw?: any;
}

export interface TwilioCallRecord {
  sid: string;
  to: string;
  from: string;
  status: string;
  duration?: string;
  direction: string;
  startTime?: string;
  endTime?: string;
  recordingUrl?: string;
}

export class TwilioAdapter {
  readonly platform = 'twilio' as const;
  private accountSid: string;
  private authToken: string;
  private masterPhoneNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_API_KEY_SECRET || '';
    this.masterPhoneNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMBER_USA || '+18482035389';
  }

  isConnected(): boolean {
    return !!this.accountSid && !!this.authToken && this.accountSid.startsWith('AC');
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    if (!this.isConnected()) {
      return {
        platform: 'twilio' as any,
        displayName: 'Twilio (Voice & VoIP)',
        status: 'not_connected',
        accountId: null,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (TWILIO_ACCOUNT_SID or AUTH_TOKEN missing)',
        capabilities: [
          'Outbound Call Initiation',
          'VoIP / WebRTC Calling',
          'Call Status Webhooks',
          'Call Recording Association',
          'Lead Outreach Automation',
        ],
      };
    }

    try {
      const res = await fetch(`${TWILIO_BASE}/Accounts/${this.accountSid}.json`, {
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          platform: 'twilio' as any,
          displayName: 'Twilio (Voice & VoIP)',
          status: 'error',
          accountId: this.accountSid,
          accountName: null,
          lastSynchronized: new Date().toISOString(),
          apiStatus: `API Error ${res.status}: ${body?.message || res.statusText}`,
          error: body?.message || 'Authentication error',
          capabilities: ['Outbound Voice', 'Call Status', 'Webhooks'],
        };
      }

      const data = await res.json();

      return {
        platform: 'twilio' as any,
        displayName: 'Twilio (Voice & VoIP)',
        status: 'connected',
        accountId: this.accountSid,
        accountName: data.friendly_name || 'RentMaikar Voice Account',
        lastSynchronized: new Date().toISOString(),
        apiStatus: 'Connected & Operational (Twilio REST API)',
        capabilities: [
          'Outbound Voice Calling',
          'VoIP Call Bridging',
          'Call Status Webhooks',
          'Recording & Transcription Linkage',
          'Lead Association',
        ],
      };
    } catch (err: any) {
      return {
        platform: 'twilio' as any,
        displayName: 'Twilio (Voice & VoIP)',
        status: 'error',
        accountId: this.accountSid,
        accountName: null,
        lastSynchronized: null,
        apiStatus: `Connection Error: ${err.message}`,
        error: err.message,
        capabilities: ['Outbound Voice', 'Webhooks'],
      };
    }
  }

  /**
   * Initiate outbound phone call to lead or customer
   */
  async initiateCall(params: InitiateCallParams): Promise<TwilioCallResult> {
    if (!this.isConnected()) {
      return { ok: false, error: 'TWILIO NOT CONNECTED: Missing TWILIO_ACCOUNT_SID or AUTH_TOKEN' };
    }

    const to = params.to.trim();
    if (!to) {
      return { ok: false, error: 'Recipient phone number is required' };
    }

    try {
      // Build TwiML connecting the call to the RentMaikar team / IVR
      const twiml = `<Response><Say voice="alice">Connecting you to RentMaikar vehicle leasing team.</Say><Dial timeout="30"><Number>${this.masterPhoneNumber}</Number></Dial></Response>`;

      const body = new URLSearchParams();
      body.append('To', to);
      body.append('From', this.masterPhoneNumber);
      body.append('Twiml', twiml);

      const res = await fetch(`${TWILIO_BASE}/Accounts/${this.accountSid}/Calls.json`, {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          ok: false,
          error: data.message || `Twilio call dispatch failed (HTTP ${res.status})`,
          raw: data,
        };
      }

      return {
        ok: true,
        callSid: data.sid,
        status: data.status || 'queued',
        to: data.to || to,
        from: data.from || this.masterPhoneNumber,
        leadId: params.leadId,
        raw: data,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Check status of a specific call
   */
  async getCallStatus(callSid: string): Promise<{ ok: boolean; status?: string; duration?: string; error?: string }> {
    if (!this.isConnected()) {
      return { ok: false, error: 'TWILIO NOT CONNECTED: Missing credentials' };
    }

    try {
      const res = await fetch(`${TWILIO_BASE}/Accounts/${this.accountSid}/Calls/${callSid}.json`, {
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return {
        ok: true,
        status: data.status,
        duration: data.duration,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Fetch recent calls for a phone number or lead
   */
  async getCallRecords(phoneFilter?: string): Promise<{ ok: boolean; calls?: TwilioCallRecord[]; error?: string }> {
    if (!this.isConnected()) {
      return { ok: false, error: 'TWILIO NOT CONNECTED' };
    }

    try {
      const url = new URL(`${TWILIO_BASE}/Accounts/${this.accountSid}/Calls.json`);
      url.searchParams.set('PageSize', '20');
      if (phoneFilter) {
        url.searchParams.set('To', phoneFilter);
      }

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      const calls: TwilioCallRecord[] = (data.calls || []).map((c: any) => ({
        sid: c.sid,
        to: c.to,
        from: c.from,
        status: c.status,
        duration: c.duration,
        direction: c.direction,
        startTime: c.start_time,
        endTime: c.end_time,
      }));

      return { ok: true, calls };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Handle incoming Twilio Webhook (Call status change, recording ready)
   */
  async handleWebhook(body: any, _headers: Record<string, string>): Promise<{
    handled: boolean;
    eventType?: string;
    callSid?: string;
    callStatus?: string;
    duration?: string;
    recordingUrl?: string;
    error?: string;
  }> {
    try {
      const callSid = body.CallSid || body.call_sid;
      const callStatus = body.CallStatus || body.call_status;
      const duration = body.CallDuration || body.duration;
      const recordingUrl = body.RecordingUrl || body.recording_url;

      return {
        handled: true,
        eventType: recordingUrl ? 'call.recording_ready' : 'call.status_change',
        callSid,
        callStatus,
        duration,
        recordingUrl,
      };
    } catch (err: any) {
      return { handled: false, error: err.message };
    }
  }
}
