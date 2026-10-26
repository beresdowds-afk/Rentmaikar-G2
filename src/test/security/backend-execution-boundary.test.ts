import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("backend execution boundary", () => {
  it("rejects unknown function names before any Supabase upstream dispatch", () => {
    const source = readFileSync(
      path.join(root, "backend/src/routes/functions.ts"),
      "utf8",
    );
    const allowlistCheck = source.indexOf("!EDGE_FUNCTIONS_SET.has(functionName)");
    const upstreamDispatch = source.indexOf("supabaseBackendService.invokeEdgeFunction");

    expect(allowlistCheck).toBeGreaterThan(-1);
    expect(upstreamDispatch).toBeGreaterThan(allowlistCheck);
    expect(source).toContain("Unknown function '${functionName}'");
  });

  it("sends direct ElevenLabs audio requests through the raw backend bridge", () => {
    const callers = [
      "src/hooks/useElevenLabsTTS.ts",
      "src/lib/accent-conversion/audio-engine.ts",
      "src/components/training/SyncedScriptPlayer.tsx",
    ];

    for (const caller of callers) {
      const source = readFileSync(path.join(root, caller), "utf8");
      expect(source).toContain("invokeRawEdgeFunction");
      expect(source).not.toContain("/functions/v1/");
    }
  });

  it("routes real frontend invokes for backend-authoritative functions through the gateway", () => {
    const source = readFileSync(
      path.join(root, "src/integrations/supabase/client.ts"),
      "utf8",
    );
    const match = source.match(
      /const LOCAL_GATEWAY_FUNCTIONS = new Set\(\[([\s\S]*?)\]\);/,
    );
    expect(match).not.toBeNull();

    const localGatewayFunctions = new Set(
      [...(match?.[1] || "").matchAll(/"([^"]+)"/g)].map((entry) => entry[1]),
    );
    expect(localGatewayFunctions.has("proxy-create-payment")).toBe(true);
    expect(localGatewayFunctions.has("send-email-notification")).toBe(true);
    expect(localGatewayFunctions.has("emergency-sos")).toBe(true);
  });

  it("wires the Persona webhook to signed event processing and OPay to its verifier", () => {
    const source = readFileSync(
      path.join(root, "backend/src/routes/webhooks.ts"),
      "utf8",
    );

    expect(source).toContain("personaWebhookService.handle");
    expect(source).toContain("handleOpayWebhook");
    expect(source).toContain("verifyTwilioWebhookSignature");
    expect(source).toContain("verifyTermiiWebhookSecret");
    expect(source).toContain("Callback processing unavailable");
    expect(source).not.toContain('return res.status(200).json({ received: true });');
    expect(source).not.toContain('return res.status(200).json({ code: "00000", message: "SUCCESS" });');
  });
});
