/**
 * RentMaikar Backend Supabase Integration Engine
 * 
 * Provides an enterprise-grade, high-performance, resilient bridge between
 * backend files, microservices, edge functions, and Supabase cloud infrastructure.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const DEFAULT_SUPABASE_URL = "https://jrsydiofzceoeddjogov.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_uE7DPlUSNxgQ1pfEA6nfQA_Z0VDAP4p";

// Validate key to reject known revoked/legacy references
const isValidKey = (k?: string): boolean => {
  if (!k) return false;
  if (k.startsWith("sb_secret_")) return false;
  if (k.includes("bwvocmhcledbwqlpcswp") || k.includes("J3dm9jbWhjbGVkYndxbHBjc3dw")) return false;
  try {
    const parts = k.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
      if (payload.ref === "bwvocmhcledbwqlpcswp") return false;
    }
  } catch {
    // Ignore base64 decoding errors for custom tokens
  }
  return true;
};

// Known edge functions catalog (all 164 edge functions in RentMaikar)
export const ALL_EDGE_FUNCTIONS = [
  "accident-emergency-dispatch",
  "activate-subscription",
  "admin-create-user",
  "admin-delete-users",
  "admin-set-user-active",
  "auth-email-hook",
  "auto-reply-simulate",
  "auto-submit-for-review",
  "billing-portal",
  "booking-email-trigger",
  "capture-paypal-order",
  "case-send-sms",
  "check-payment-health",
  "check-repeat-call-ins",
  "comms-test-console",
  "create-call-in",
  "create-opay-order",
  "create-paypal-order",
  "create-paystack-recipient",
  "create-paystack-transaction",
  "dispatch-event-notifications",
  "elevenlabs-agent-token",
  "elevenlabs-stt",
  "elevenlabs-test-audio-url",
  "elevenlabs-tts",
  "elevenlabs-tts-stream",
  "elevenlabs-voices",
  "email-domain-status-check",
  "email-tracking",
  "email-webhook",
  "emqx-monitoring",
  "emqx-secret-rotation",
  "end-voip-call",
  "enforce-call-in-geofence",
  "expire-call-ins",
  "expiry-notification-ivr",
  "export-user-documents",
  "generate-api-key",
  "generate-daily-tasks",
  "generate-inspection-pdf",
  "generate-vehicle-mqtt-token",
  "get-paypal-config",
  "get-psp-config",
  "get-recording-url",
  "get-vapid-public-key",
  "gps-worker-watchdog",
  "handle-email-suppression",
  "handle-email-unsubscribe",
  "hologram-admin",
  "hologram-sync",
  "inbox-attachment-ocr",
  "incoming-call-forward",
  "initiate-paypal-payout",
  "initiate-paystack-transfer",
  "initiate-voip-call",
  "iot-accident-detection",
  "iot-admin",
  "iot-auto-provision",
  "iot-offline-alerts",
  "iot-scheduled-sync",
  "manychat-webhook",
  "mqtt-ingestion-worker",
  "notify-referees",
  "notify-training-review",
  "notify-withdrawal",
  "opay-webhook",
  "payment-default-ivr",
  "paypal-webhook",
  "paystack-webhook",
  "persona-config",
  "persona-create-inquiry",
  "persona-expiry-scan",
  "persona-provision-template",
  "persona-reconcile",
  "persona-retry-verification",
  "persona-send-reverification",
  "persona-webhook",
  "phone-otp-custom",
  "preview-transactional-email",
  "process-agreement-renewals",
  "process-call-recording",
  "process-daily-debits",
  "process-email-queue",
  "process-expiry-notifications",
  "process-inspection-reminders",
  "process-owner-payouts",
  "process-payment-defaults",
  "process-payment-unlock",
  "process-predue-reminders",
  "provider-billing-sync",
  "provider-health-alerts",
  "proxy-consent-manager",
  "reconcile-payments",
  "reconcile-rental-terms",
  "reconcile-settlements",
  "recording-status-callback",
  "referee-attestation",
  "refresh-export-download-url",
  "region-autobuild",
  "renew-call-in",
  "reprocess-email-dlq",
  "reprocess-sms-dlq",
  "resend-events",
  "retry-event-notifications",
  "sarekon-admin",
  "sarekon-location-worker",
  "save-push-subscription",
  "send-2fa-code",
  "send-agreement-email",
  "send-approval-notification",
  "send-booking-reminders",
  "send-email-reply",
  "send-in-app-message",
  "send-inbox-reply",
  "send-incident-notification",
  "send-meta-capi",
  "send-order-notification",
  "send-outbound-email",
  "send-password-reset",
  "send-payment-notification",
  "send-persona-digest",
  "send-price-notification",
  "send-push-notification",
  "send-reconciliation-alert",
  "send-shipping-notification",
  "send-sms-notification",
  "send-task-notification",
  "send-transactional-email",
  "send-verification-email",
  "sent-health",
  "sent-inbound",
  "sent-status",
  "sent-webhook-config",
  "shutdown-warning-ivr",
  "sms-commands",
  "social-inbox-webhook",
  "subscribe-to-plan",
  "sync-approved-vehicles",
  "sync-auth-identity",
  "telemetry-dispatch",
  "telemetry-health-monitor",
  "telemetry-ingest",
  "termii-webhook",
  "traccar-admin",
  "training-compliance-reminders",
  "twilio-test-send",
  "twilio-webhook",
  "vehicle-return-ivr",
  "vehicle-return-reminder",
  "vehicle-shutdown-warning",
  "verify-credentials",
  "verify-opay-order",
  "verify-paystack-transaction",
  "verify-phone",
  "verify-referees",
  "voice-access-token",
  "voice-call-request",
  "voice-ivr-case",
  "voice-twiml-config",
  "voice-twiml-dial",
  "voip-call-transcript-log",
  "voip-status-callback",
  "whatchimp-webhook",
  "whatsapp-commands",
];

export const EDGE_FUNCTIONS_SET = new Set(ALL_EDGE_FUNCTIONS);

export interface EdgeFunctionInvocationResult {
  ok: boolean;
  status: number;
  data?: any;
  error?: string;
  latencyMs: number;
  functionName: string;
  provider: "supabase_edge" | "backend_gateway" | "resilient_simulation";
}

export class SupabaseBackendService {
  private client: SupabaseClient | null = null;
  private url: string;
  private apiKey: string;
  private serviceRoleKey: string | null = null;
  private dynamicFunctionsSet: Set<string>;

  constructor() {
    const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
    this.url = (rawUrl && !rawUrl.includes("bwvocmhcledbwqlpcswp"))
      ? rawUrl.replace(/\/+$/, "")
      : DEFAULT_SUPABASE_URL;

    const rawKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    this.apiKey = (rawKey && isValidKey(rawKey)) ? rawKey : DEFAULT_SUPABASE_KEY;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY && isValidKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    }

    this.dynamicFunctionsSet = new Set(ALL_EDGE_FUNCTIONS);
    this.discoverLocalEdgeFunctions();
  }

  /**
   * Scans filesystem if available to auto-discover any newly created edge functions
   */
  private discoverLocalEdgeFunctions(): void {
    const searchPaths = [
      path.resolve(process.cwd(), "supabase/functions"),
      path.resolve(process.cwd(), "../supabase/functions"),
    ];

    for (const sp of searchPaths) {
      try {
        if (fs.existsSync(sp)) {
          const entries = fs.readdirSync(sp, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith("_")) {
              this.dynamicFunctionsSet.add(entry.name);
            }
          }
        }
      } catch {
        // Ignore filesystem scan errors
      }
    }
  }

  /**
   * Gets the shared Supabase Client instance (singleton)
   */
  public getClient(userToken?: string): SupabaseClient {
    if (userToken) {
      return createClient(this.url, this.apiKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${userToken}` } },
      });
    }

    if (!this.client) {
      const activeKey = this.serviceRoleKey || this.apiKey;
      this.client = createClient(this.url, activeKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    return this.client;
  }

  public getUrl(): string {
    return this.url;
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public isKnownFunction(name: string): boolean {
    return this.dynamicFunctionsSet.has(name) || /^[a-zA-Z0-9_-]+$/.test(name);
  }

  public getAllFunctions(): string[] {
    return Array.from(this.dynamicFunctionsSet).sort();
  }

  /**
   * Dispatches an Edge Function invocation upstream to Supabase
   * with complete header and authorization forwarding.
   */
  public async invokeEdgeFunction(
    functionName: string,
    body: any = {},
    options: {
      userToken?: string;
      method?: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<EdgeFunctionInvocationResult> {
    const startTime = Date.now();
    const edgeUrl = `${this.url}/functions/v1/${functionName}`;
    const timeoutMs = options.timeoutMs || 25000;
    const method = options.method || "POST";

    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: this.apiKey,
      ...(options.headers || {}),
    };

    if (options.userToken) {
      forwardHeaders["Authorization"] = options.userToken.startsWith("Bearer ")
        ? options.userToken
        : `Bearer ${options.userToken}`;
    } else if (!forwardHeaders["Authorization"]) {
      forwardHeaders["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(edgeUrl, {
        method,
        headers: forwardHeaders,
        body: method !== "GET" && method !== "HEAD" ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      if (res.status === 404) {
        // Upstream Edge function not deployed on Supabase project or returned 404
        return {
          ok: false,
          status: 404,
          error: `Edge function '${functionName}' not found on Supabase upstream`,
          latencyMs,
          functionName,
          provider: "supabase_edge",
        };
      }

      const contentType = res.headers.get("content-type") || "";
      let data: any;
      if (contentType.includes("application/json")) {
        data = await res.json().catch(() => ({}));
      } else {
        data = { text: await res.text().catch(() => "") };
      }

      return {
        ok: res.ok,
        status: res.status,
        data,
        latencyMs,
        functionName,
        provider: "supabase_edge",
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === "AbortError";
      return {
        ok: false,
        status: isTimeout ? 504 : 502,
        error: isTimeout
          ? `Edge function '${functionName}' timed out after ${timeoutMs}ms`
          : (err.message || "Failed to connect to Supabase Edge Functions upstream"),
        latencyMs,
        functionName,
        provider: "supabase_edge",
      };
    }
  }

  /**
   * Probes Supabase connectivity and reports latency & health
   */
  public async checkSupabaseHealth(): Promise<{
    healthy: boolean;
    url: string;
    restStatus: number;
    latencyMs: number;
    timestamp: string;
    totalEdgeFunctionsAvailable: number;
  }> {
    const startTime = Date.now();
    try {
      const res = await fetch(`${this.url}/rest/v1/`, {
        method: "HEAD",
        headers: {
          apikey: this.apiKey,
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const latencyMs = Date.now() - startTime;
      return {
        healthy: res.status >= 200 && res.status < 500,
        url: this.url,
        restStatus: res.status,
        latencyMs,
        timestamp: new Date().toISOString(),
        totalEdgeFunctionsAvailable: this.dynamicFunctionsSet.size,
      };
    } catch {
      return {
        healthy: false,
        url: this.url,
        restStatus: 0,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        totalEdgeFunctionsAvailable: this.dynamicFunctionsSet.size,
      };
    }
  }

  /**
   * Executes a direct REST query to Supabase PostgREST endpoints
   */
  public async executeRestQuery<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
      userToken?: string;
    } = {}
  ): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.url}/rest/v1${cleanPath}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: this.apiKey,
      Authorization: options.userToken ? `Bearer ${options.userToken}` : `Bearer ${this.apiKey}`,
      ...(options.headers || {}),
    };

    try {
      const res = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const data = await res.json().catch(() => null);
      return {
        ok: res.ok,
        status: res.status,
        data,
        error: !res.ok ? (data?.message || data?.error || `HTTP ${res.status}`) : undefined,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 500,
        error: err.message || "Failed to execute Supabase REST query",
      };
    }
  }
}

export const supabaseBackendService = new SupabaseBackendService();
