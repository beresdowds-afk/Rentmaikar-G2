import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  auditTemplate,
  REGION_FIXTURES,
  type TemplateKind,
} from "@/lib/region-templates";

const KINDS: TemplateKind[] = [
  "payment_reminder",
  "payment_default",
  "welcome_sms",
  "welcome_email",
  "password_reset",
  "inspection_reminder",
  "vehicle_shutdown_warning",
];

describe("region template audit", () => {
  for (const regionName of Object.keys(REGION_FIXTURES)) {
    const cfg = REGION_FIXTURES[regionName];
    describe(regionName, () => {
      for (const kind of KINDS) {
        it(`${kind} uses ${regionName} tokens only`, () => {
          const r = renderTemplate(kind, cfg, {
            name: "Alex",
            amount: 12345,
            helpline: "5551234567",
          });
          expect(auditTemplate(r, cfg)).toEqual([]);
          if (r.channel === "sms") expect(r.provider).toBe(cfg.smsProvider);
          if (kind === "welcome_email") {
            expect(r.body).toContain(cfg.currency);
            expect(r.body).toContain(cfg.currencySymbol);
            expect(r.body).toContain(cfg.paymentGateway);
          }
          if (kind === "payment_reminder" || kind === "vehicle_shutdown_warning") {
            expect(r.body).toContain(cfg.currencySymbol);
          }
        });
      }
    });
  }

  it("US and NG produce different rendered payment reminders", () => {
    const us = renderTemplate("payment_reminder", REGION_FIXTURES.USA, { amount: 100 });
    const ng = renderTemplate("payment_reminder", REGION_FIXTURES.Nigeria, { amount: 100 });
    expect(us.body).not.toEqual(ng.body);
    expect(us.provider).not.toEqual(ng.provider);
    expect(us.body).toContain("$");
    expect(ng.body).toContain("₦");
  });

  it("Ghana (arbitrary new region) renders with its own tokens", () => {
    const gh = renderTemplate("welcome_email", REGION_FIXTURES.Ghana);
    expect(gh.body).toContain("Ghana");
    expect(gh.body).toContain("GHS");
    expect(gh.body).toContain("₵");
    expect(gh.body).toContain("flutterwave");
  });
});
