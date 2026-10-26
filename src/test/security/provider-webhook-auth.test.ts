import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  verifyTermiiWebhookSecret,
  verifyTwilioWebhookSignature,
} from "../../../backend/src/routes/webhooks";

describe("Cloud Run provider webhook authentication", () => {
  const originalTwilioToken = process.env.TWILIO_AUTH_TOKEN;
  const originalTermiiSecret = process.env.TERMII_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.TWILIO_AUTH_TOKEN = originalTwilioToken;
    process.env.TERMII_WEBHOOK_SECRET = originalTermiiSecret;
  });

  it("validates Twilio signatures over the configured public URL and form fields", () => {
    process.env.TWILIO_AUTH_TOKEN = "twilio-test-token";
    const originalUrl = "/api/webhooks/twilio";
    const body = { To: "+15551234567", Body: "STATUS" };
    const signedValue = `https://staging.rentmaikar.com${originalUrl}Body${body.Body}To${body.To}`;
    const signature = crypto
      .createHmac("sha1", process.env.TWILIO_AUTH_TOKEN)
      .update(signedValue)
      .digest("base64");
    const request = {
      originalUrl,
      url: originalUrl,
      protocol: "https",
      headers: { "x-twilio-signature": signature },
      body,
    } as any;

    expect(verifyTwilioWebhookSignature(request)).toBe(true);
    expect(verifyTwilioWebhookSignature({ ...request, body: { ...body, Body: "ADMIN" } })).toBe(false);
    expect(verifyTwilioWebhookSignature({ ...request, headers: {} })).toBe(false);
  });

  it("fails closed when Termii webhook secret is absent or does not match", () => {
    process.env.TERMII_WEBHOOK_SECRET = "termii-test-secret";
    expect(verifyTermiiWebhookSecret({ headers: { "x-termii-secret": "wrong" } } as any)).toBe(false);
    expect(verifyTermiiWebhookSecret({ headers: { "x-termii-secret": "termii-test-secret" } } as any)).toBe(true);

    delete process.env.TERMII_WEBHOOK_SECRET;
    expect(verifyTermiiWebhookSecret({ headers: { "x-termii-secret": "termii-test-secret" } } as any)).toBe(false);
  });
});
