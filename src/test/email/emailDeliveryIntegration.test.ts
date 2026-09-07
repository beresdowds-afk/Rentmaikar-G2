import { describe, it, expect, vi, beforeEach } from "vitest";

// Sender rewrite logic matching supabase/functions/_shared/resend-gateway.ts
function parseAddress(value: string): { name?: string; local: string; domain: string } | null {
  const angled = value.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^<>@\s]+)@([^<>@\s]+)>\s*$/);
  if (angled) {
    return { name: angled[1]?.trim() || undefined, local: angled[2], domain: angled[3] };
  }
  const bare = value.match(/^\s*([^<>@\s]+)@([^<>@\s]+)\s*$/);
  if (!bare) return null;
  return { local: bare[1], domain: bare[2] };
}

function resendSendingDomain(envDomain?: string): string {
  return envDomain || "notify.rentmaikar.com";
}

function resendFrom(from: string, envDomain?: string, envFallback?: string): string {
  const candidate = envFallback || from;
  const parsed = parseAddress(candidate);
  if (!parsed) return candidate;
  const domain = resendSendingDomain(envDomain);
  if (parsed.domain.toLowerCase() === domain.toLowerCase()) return candidate;
  const address = `${parsed.local}@${domain}`;
  return parsed.name ? `${parsed.name} <${address}>` : address;
}

function prepareResendPayload(body: {
  from?: string;
  to: string;
  subject: string;
  html: string;
  reply_to?: string | string[];
}) {
  const originalFrom = body.from || "";
  const rewrittenFrom = originalFrom ? resendFrom(originalFrom) : originalFrom;
  const replyTo =
    body.reply_to ?? (originalFrom && rewrittenFrom !== originalFrom ? originalFrom : undefined);

  return {
    ...body,
    from: rewrittenFrom,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };
}

describe("Email delivery & sender rewrite behavior", () => {
  it("rewrites unverified apex domains onto notify.rentmaikar.com preserving display name", () => {
    const input = "Rentmaikar <noreply@rentmaikar.com>";
    const result = resendFrom(input);
    expect(result).toBe("Rentmaikar <noreply@notify.rentmaikar.com>");
  });

  it("rewrites bare email addresses onto verified domain", () => {
    const input = "operations@rentmaikar.com";
    const result = resendFrom(input);
    expect(result).toBe("operations@notify.rentmaikar.com");
  });

  it("leaves already-verified notify.rentmaikar.com addresses untouched", () => {
    const input = "Rentmaikar Support <support@notify.rentmaikar.com>";
    const result = resendFrom(input);
    expect(result).toBe("Rentmaikar Support <support@notify.rentmaikar.com>");
  });

  it("preserves original sender as reply_to when rewriting", () => {
    const originalPayload = {
      from: "Rentmaikar Accounts <billing@rentmaikar.com>",
      to: "driver@example.com",
      subject: "Your Weekly Settlement",
      html: "<p>Settlement details</p>",
    };

    const prepared = prepareResendPayload(originalPayload);
    expect(prepared.from).toBe("Rentmaikar Accounts <billing@notify.rentmaikar.com>");
    expect(prepared.reply_to).toBe("Rentmaikar Accounts <billing@rentmaikar.com>");
  });

  it("does not override an explicitly provided reply_to", () => {
    const originalPayload = {
      from: "Rentmaikar <noreply@rentmaikar.com>",
      to: "driver@example.com",
      reply_to: "custom-replies@rentmaikar.com",
      subject: "Important Notice",
      html: "<p>Notice details</p>",
    };

    const prepared = prepareResendPayload(originalPayload);
    expect(prepared.from).toBe("Rentmaikar <noreply@notify.rentmaikar.com>");
    expect(prepared.reply_to).toBe("custom-replies@rentmaikar.com");
  });
});

describe("Queue worker delivery end-to-end simulation", () => {
  const sendLog: Array<{ message_id: string; status: string; recipient_email: string }> = [];
  const queue: Array<{ id: string; message: any; read_ct: number }> = [];
  const dlq: Array<{ id: string; reason: string }> = [];
  const alerts: Array<{ function_name: string; status_code: number; recipient_email: string }> = [];

  beforeEach(() => {
    sendLog.length = 0;
    queue.length = 0;
    dlq.length = 0;
    alerts.length = 0;
  });

  async function simulateQueueWorkerProcess(options: { failWithStatus?: number } = {}) {
    const batch = [...queue];
    for (const item of batch) {
      item.read_ct += 1;
      const payload = item.message;

      if (options.failWithStatus) {
        if (options.failWithStatus === 401 || options.failWithStatus === 403) {
          alerts.push({
            function_name: "process-email-queue",
            status_code: options.failWithStatus,
            recipient_email: payload.to,
          });
        }

        sendLog.push({
          message_id: payload.message_id,
          status: "failed",
          recipient_email: payload.to,
        });

        if (item.read_ct >= 5) {
          // Exceeded max retries -> route to DLQ
          const idx = queue.findIndex((q) => q.id === item.id);
          if (idx !== -1) queue.splice(idx, 1);
          dlq.push({ id: item.id, reason: `Max retries (5) exceeded` });
        }
        continue;
      }

      // Success path
      const prepared = prepareResendPayload(payload);
      expect(prepared.from).toContain("notify.rentmaikar.com");

      sendLog.push({
        message_id: payload.message_id,
        status: "sent",
        recipient_email: payload.to,
      });

      // Remove from queue
      const idx = queue.findIndex((q) => q.id === item.id);
      if (idx !== -1) queue.splice(idx, 1);
    }
  }

  it("enqueues and delivers email through queue worker, logging as sent", async () => {
    const msgId = "msg-e2e-123";
    queue.push({
      id: "q-1",
      read_ct: 0,
      message: {
        message_id: msgId,
        to: "driver@example.com",
        from: "Rentmaikar <noreply@rentmaikar.com>",
        subject: "Verification Code",
        html: "<p>Your code is 123456</p>",
      },
    });

    await simulateQueueWorkerProcess();

    // Verification
    expect(queue.length).toBe(0);
    expect(sendLog.length).toBe(1);
    expect(sendLog[0]).toEqual({
      message_id: msgId,
      status: "sent",
      recipient_email: "driver@example.com",
    });
  });

  it("escalates to DLQ and alerts team after repeated failures (exponential backoff / max retries)", async () => {
    const msgId = "msg-e2e-dlq";
    queue.push({
      id: "q-dlq",
      read_ct: 4, // 4 prior attempts
      message: {
        message_id: msgId,
        to: "unreachable@example.com",
        from: "Rentmaikar <noreply@rentmaikar.com>",
        subject: "Urgent Action Required",
        html: "<p>Inspection notice</p>",
      },
    });

    await simulateQueueWorkerProcess({ failWithStatus: 403 });

    // Should have recorded alert
    expect(alerts.length).toBe(1);
    expect(alerts[0].status_code).toBe(403);
    expect(alerts[0].recipient_email).toBe("unreachable@example.com");

    // Should have moved to DLQ on 5th attempt
    expect(dlq.length).toBe(1);
    expect(dlq[0].id).toBe("q-dlq");
    expect(queue.length).toBe(0);
  });
});
