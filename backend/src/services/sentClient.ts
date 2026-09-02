export interface SentMessagePayload {
  to: string[];
  channel: "sms" | "whatsapp" | "rcs";
  text?: string;
  template?: {
    id: string;
    parameters?: Record<string, string | number>;
  };
  sender_id?: string;
  sandbox?: boolean;
  metadata?: Record<string, any>;
}

export class SentBackendClient {
  private apiKey: string;
  private baseUrl: string;
  private senderId: string;
  private sandbox: boolean;

  constructor() {
    this.apiKey = process.env.SENT_API_KEY || "";
    this.baseUrl = process.env.SENT_API_BASE_URL || "https://api.sent.dm";
    this.senderId = process.env.SENT_SENDER_ID || "Rentmaikar";
    this.sandbox = process.env.SENT_SANDBOX_MODE === "true" || !this.apiKey;
  }

  async sendMessage(payload: SentMessagePayload) {
    if (this.apiKey && this.apiKey !== "mock" && !this.apiKey.startsWith("demo_")) {
      const response = await fetch(`${this.baseUrl}/v3/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "x-idempotency-key": `rm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          ...(this.sandbox ? { "x-sandbox": "true" } : {}),
        },
        body: JSON.stringify({
          to: payload.to,
          channel: payload.channel,
          text: payload.text,
          template: payload.template,
          sender_id: payload.sender_id || this.senderId,
          metadata: {
            ...payload.metadata,
            platform: "Rentmaikar_Backend",
            dispatched_at: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.message || `Sent.dm HTTP Error ${response.status}`);
      }

      return await response.json();
    }

    // Sandbox fallback simulation
    return {
      id: `sent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: "delivered",
      channel: payload.channel,
      to: payload.to,
      from: payload.sender_id || this.senderId,
      created_at: new Date().toISOString(),
      cost: { amount: 0.012, currency: "USD" },
      sandbox: true,
    };
  }
}

export const sentBackendClient = new SentBackendClient();
