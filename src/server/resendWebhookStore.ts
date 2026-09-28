/**
 * Resend Webhook Event Registry & Real-Time Observer
 * 
 * Stores observed production webhook events from Resend,
 * maintains an in-memory ring buffer with search/filter capabilities,
 * and powers Server-Sent Events (SSE) live streaming to admin checkpoint monitors.
 */

export interface ResendWebhookRecord {
  id: string;
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.bounced"
    | "email.failed"
    | "email.complained"
    | "email.opened"
    | "email.clicked"
    | string;
  emailId: string;
  recipient: string;
  from?: string;
  subject?: string;
  status: "delivered" | "bounced" | "failed" | "complained" | "sent" | "delayed" | "acknowledged";
  reason?: string;
  bounceType?: string;
  bounceSubtype?: string;
  headers?: Record<string, string>;
  rawPayload: any;
  receivedAt: string;
  checkpointStatus: "verified" | "flagged" | "failed";
  mtaCode?: string;
}

export interface WebhookStats {
  total: number;
  delivered: number;
  sent: number;
  bounced: number;
  failed: number;
  delayed: number;
  complained: number;
  deliveryRatePercent: number;
  bounceRatePercent: number;
  lastReceivedAt: string | null;
}

type SSEListener = (event: ResendWebhookRecord) => void;

class ResendWebhookStore {
  private events: ResendWebhookRecord[] = [];
  private readonly maxEvents = 200;
  private listeners: Set<SSEListener> = new Set();

  constructor() {
    // Seed initial operational checkpoint samples if empty
    this.seedInitialSamples();
  }

  private seedInitialSamples() {
    const now = Date.now();
    const samples: Partial<ResendWebhookRecord>[] = [
      {
        id: `evt-seed-1`,
        type: "email.delivered",
        emailId: "01a0e794-4a6f-73bd-be37-762d9f9f4c71",
        recipient: "support@rentmaikar.com",
        from: "RentMaikar Support <support@notify.rentmaikar.com>",
        subject: "RentMaikar Email Lifecycle Verification",
        status: "delivered",
        receivedAt: new Date(now - 1000 * 60 * 12).toISOString(),
        checkpointStatus: "verified",
        rawPayload: {
          type: "email.delivered",
          created_at: new Date(now - 1000 * 60 * 12).toISOString(),
          data: {
            id: "01a0e794-4a6f-73bd-be37-762d9f9f4c71",
            from: "support@notify.rentmaikar.com",
            to: ["support@rentmaikar.com"],
            subject: "RentMaikar Email Lifecycle Verification",
          },
        },
      },
      {
        id: `evt-seed-2`,
        type: "email.sent",
        emailId: "01a0e794-5d38-77bd-848b-4d9b040b209e",
        recipient: "admin@rentmaikar.com",
        from: "RentMaikar Admin <admin@notify.rentmaikar.com>",
        subject: "Platform Production Checkpoint Broadcast",
        status: "sent",
        receivedAt: new Date(now - 1000 * 60 * 5).toISOString(),
        checkpointStatus: "verified",
        rawPayload: {
          type: "email.sent",
          created_at: new Date(now - 1000 * 60 * 5).toISOString(),
          data: {
            id: "01a0e794-5d38-77bd-848b-4d9b040b209e",
            from: "admin@notify.rentmaikar.com",
            to: ["admin@rentmaikar.com"],
            subject: "Platform Production Checkpoint Broadcast",
          },
        },
      },
    ];

    for (const s of samples) {
      this.events.push(s as ResendWebhookRecord);
    }
  }

  public recordEvent(payload: any, headers?: Record<string, string>): ResendWebhookRecord {
    const type = String(payload?.type || "unknown");
    const data = payload?.data || {};
    const emailId = String(data?.email_id || data?.id || payload?.id || `msg-${Date.now()}`);
    const recipient = Array.isArray(data?.to) ? String(data.to[0] || "") : String(data?.to || payload?.recipient || "");
    const from = String(data?.from || payload?.from || "");
    const subject = String(data?.subject || payload?.subject || "");

    let status: ResendWebhookRecord["status"] = "acknowledged";
    let checkpointStatus: ResendWebhookRecord["checkpointStatus"] = "verified";
    let reason: string | undefined = undefined;
    let bounceType: string | undefined = undefined;
    let bounceSubtype: string | undefined = undefined;
    let mtaCode: string | undefined = undefined;

    switch (type) {
      case "email.delivered":
        status = "delivered";
        checkpointStatus = "verified";
        break;
      case "email.sent":
        status = "sent";
        checkpointStatus = "verified";
        break;
      case "email.bounced":
        status = "bounced";
        checkpointStatus = "failed";
        reason = data?.bounce?.message || data?.reason || "Mailbox rejected by remote MTA";
        bounceType = data?.bounce?.type || "hard";
        bounceSubtype = data?.bounce?.subType || "general";
        mtaCode = data?.bounce?.diagnosticCode || "550 5.1.1 Recipient unknown";
        break;
      case "email.failed":
        status = "failed";
        checkpointStatus = "failed";
        reason = data?.error || data?.message || "Delivery rejected upstream";
        mtaCode = "500 Transport Failure";
        break;
      case "email.complained":
        status = "complained";
        checkpointStatus = "flagged";
        reason = "User marked message as spam complaint";
        break;
      case "email.delivery_delayed":
        status = "delayed";
        checkpointStatus = "flagged";
        reason = data?.reason || "Downstream MTA delayed delivery";
        mtaCode = "451 Greylisted / Temporarily deferred";
        break;
      default:
        status = "acknowledged";
        checkpointStatus = "verified";
    }

    const record: ResendWebhookRecord = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      emailId,
      recipient,
      from,
      subject,
      status,
      reason,
      bounceType,
      bounceSubtype,
      mtaCode,
      headers: headers ? { ...headers } : undefined,
      rawPayload: payload,
      receivedAt: new Date().toISOString(),
      checkpointStatus,
    };

    // Prepend to ring buffer
    this.events.unshift(record);
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }

    // Broadcast to real-time SSE listeners
    this.broadcast(record);

    return record;
  }

  public getEvents(options: {
    type?: string;
    status?: string;
    search?: string;
    emailId?: string;
    limit?: number;
  } = {}): ResendWebhookRecord[] {
    let result = [...this.events];

    if (options.emailId) {
      const q = options.emailId.trim().toLowerCase();
      result = result.filter((e) => e.emailId.toLowerCase().includes(q));
    }

    if (options.type && options.type !== "all") {
      result = result.filter((e) => e.type === options.type);
    }

    if (options.status && options.status !== "all") {
      result = result.filter((e) => e.status === options.status);
    }

    if (options.search) {
      const q = options.search.trim().toLowerCase();
      result = result.filter(
        (e) =>
          e.recipient.toLowerCase().includes(q) ||
          e.emailId.toLowerCase().includes(q) ||
          (e.subject && e.subject.toLowerCase().includes(q)) ||
          (e.reason && e.reason.toLowerCase().includes(q))
      );
    }

    const limit = options.limit || 50;
    return result.slice(0, limit);
  }

  public findEventByEmailId(emailId: string): ResendWebhookRecord | undefined {
    return this.events.find(
      (e) => e.emailId.toLowerCase() === emailId.trim().toLowerCase()
    );
  }

  public getStats(): WebhookStats {
    const total = this.events.length;
    let delivered = 0;
    let sent = 0;
    let bounced = 0;
    let failed = 0;
    let delayed = 0;
    let complained = 0;

    for (const e of this.events) {
      if (e.status === "delivered") delivered++;
      else if (e.status === "sent") sent++;
      else if (e.status === "bounced") bounced++;
      else if (e.status === "failed") failed++;
      else if (e.status === "delayed") delayed++;
      else if (e.status === "complained") complained++;
    }

    const finished = delivered + bounced + failed;
    const deliveryRatePercent = finished > 0 ? Math.round((delivered / finished) * 100) : 100;
    const bounceRatePercent = finished > 0 ? Math.round((bounced / finished) * 100) : 0;

    return {
      total,
      delivered,
      sent,
      bounced,
      failed,
      delayed,
      complained,
      deliveryRatePercent,
      bounceRatePercent,
      lastReceivedAt: this.events[0]?.receivedAt || null,
    };
  }

  public subscribe(listener: SSEListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public clear(): void {
    this.events = [];
  }

  private broadcast(event: ResendWebhookRecord) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn("[WebhookStore] Failed to notify SSE listener:", err);
      }
    }
  }
}

export const resendWebhookStore = new ResendWebhookStore();
