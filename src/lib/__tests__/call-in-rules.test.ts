import { describe, it, expect } from "vitest";

// Business-rule tests for driver call-in system.

// ---- Expiry rules (mirror of DB trigger set_call_in_expiry) ----
export function computeExpiry(type: "fault" | "maintenance" | "sick", startedAt: Date): Date {
  const ms = type === "sick" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(startedAt.getTime() + ms);
}

// ---- Geofence breach (mirror of enforce-call-in-geofence) ----
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function isBreached(centerLat: number, centerLng: number, lat: number, lng: number, radiusM: number): boolean {
  return haversineMeters(centerLat, centerLng, lat, lng) > radiusM;
}

// ---- Repeat-call-in escalation (mirror of check-repeat-call-ins) ----
export function shouldEscalateToRecall(callIns: { started_at: string; type: string }[]): boolean {
  const relevant = callIns.filter((c) => c.type === "fault" || c.type === "maintenance");
  if (relevant.length < 2) return false;
  const days = [...new Set(relevant.map((c) => new Date(c.started_at).toISOString().slice(0, 10)))].sort();
  if (days.length < 2) return false;
  const d1 = new Date(days[days.length - 2] + "T00:00:00Z").getTime();
  const d2 = new Date(days[days.length - 1] + "T00:00:00Z").getTime();
  return d2 - d1 === 24 * 60 * 60 * 1000;
}

// ---- Fault / Maintenance Renewal & Vehicle Call-In Rules ----
export const MAX_CALL_IN_RENEWALS = 3;
export const RENEWAL_EXTENSION_MS = 24 * 60 * 60 * 1000;

export interface CallInRenewalState {
  type: "fault" | "maintenance" | "sick";
  status: string;
  renewal_count: number;
  max_renewals?: number;
  expires_at: string;
  recall_initiated?: boolean;
}

export function canRenewCallIn(callIn: CallInRenewalState): { eligible: boolean; reason?: string } {
  if (callIn.status !== "active") {
    return { eligible: false, reason: "Only active call-ins can be renewed" };
  }
  if (callIn.type !== "fault" && callIn.type !== "maintenance") {
    return { eligible: false, reason: "Only fault and maintenance call-ins are renewable every 24hrs" };
  }
  const max = callIn.max_renewals ?? MAX_CALL_IN_RENEWALS;
  if (callIn.renewal_count >= max) {
    return { eligible: false, reason: `Maximum of ${max} renewals reached. Vehicle call-in process required.` };
  }
  return { eligible: true };
}

export function computeRenewal(
  callIn: CallInRenewalState,
  referenceTime: Date = new Date()
): {
  new_renewal_count: number;
  new_expires_at: Date;
  should_initiate_vehicle_call_in: boolean;
  message: string;
} {
  const max = callIn.max_renewals ?? MAX_CALL_IN_RENEWALS;
  const currentCount = callIn.renewal_count || 0;

  if (currentCount >= max) {
    return {
      new_renewal_count: currentCount,
      new_expires_at: new Date(callIn.expires_at),
      should_initiate_vehicle_call_in: true,
      message: `Maximum ${max} renewals reached. Vehicle call-in process initiated.`,
    };
  }

  const newCount = currentCount + 1;
  const currentExpires = new Date(callIn.expires_at).getTime();
  const baseTime = Math.max(currentExpires, referenceTime.getTime());
  const newExpiresAt = new Date(baseTime + RENEWAL_EXTENSION_MS);
  const shouldInitiateRecall = newCount >= max;

  return {
    new_renewal_count: newCount,
    new_expires_at: newExpiresAt,
    should_initiate_vehicle_call_in: shouldInitiateRecall,
    message: shouldInitiateRecall
      ? `Final renewal (${newCount} of ${max}) granted. Vehicle call-in process initiated for mandatory inspection.`
      : `Renewed for 24 hours. (Renewal ${newCount} of ${max}).`,
  };
}

describe("call-in expiry (24h / 7d rules)", () => {
  const start = new Date("2026-07-09T10:00:00Z");

  it("fault expires 24 hours after start", () => {
    const exp = computeExpiry("fault", start);
    expect(exp.getTime() - start.getTime()).toBe(24 * 3600_000);
  });

  it("maintenance expires 24 hours after start", () => {
    const exp = computeExpiry("maintenance", start);
    expect(exp.getTime() - start.getTime()).toBe(24 * 3600_000);
  });

  it("sick expires 7 days (168h) after start", () => {
    const exp = computeExpiry("sick", start);
    expect(exp.getTime() - start.getTime()).toBe(7 * 24 * 3600_000);
  });

  it("call-in is still active before expiry", () => {
    const exp = computeExpiry("fault", start);
    const now = new Date(start.getTime() + 23 * 3600_000);
    expect(exp.getTime() > now.getTime()).toBe(true);
  });

  it("call-in has expired after window", () => {
    const exp = computeExpiry("fault", start);
    const now = new Date(start.getTime() + 25 * 3600_000);
    expect(exp.getTime() < now.getTime()).toBe(true);
  });
});

describe("geofence breach + payment reactivation", () => {
  const center = { lat: 6.5244, lng: 3.3792 }; // Lagos

  it("within 20 m radius is NOT breached", () => {
    // ~10m north
    const lat2 = center.lat + 10 / 111_111;
    expect(isBreached(center.lat, center.lng, lat2, center.lng, 20)).toBe(false);
  });

  it("outside 20 m radius IS breached", () => {
    const lat2 = center.lat + 40 / 111_111; // ~40m north
    expect(isBreached(center.lat, center.lng, lat2, center.lng, 20)).toBe(true);
  });

  it("breach implies payments should be reactivated", () => {
    // Domain rule: on breach, DB trigger closes call-in → suspension cleared.
    const breached = isBreached(center.lat, center.lng, center.lat + 0.01, center.lng, 20);
    const paymentsSuspended = !breached;
    expect(paymentsSuspended).toBe(false);
  });
});

describe("2-consecutive-days recall escalation", () => {
  it("single call-in does NOT escalate", () => {
    expect(shouldEscalateToRecall([{ started_at: "2026-07-09T10:00:00Z", type: "fault" }])).toBe(false);
  });

  it("two call-ins on the SAME day do NOT escalate", () => {
    expect(shouldEscalateToRecall([
      { started_at: "2026-07-09T10:00:00Z", type: "fault" },
      { started_at: "2026-07-09T18:00:00Z", type: "maintenance" },
    ])).toBe(false);
  });

  it("two call-ins on CONSECUTIVE days DO escalate", () => {
    expect(shouldEscalateToRecall([
      { started_at: "2026-07-08T10:00:00Z", type: "fault" },
      { started_at: "2026-07-09T08:00:00Z", type: "maintenance" },
    ])).toBe(true);
  });

  it("two call-ins with a gap day do NOT escalate", () => {
    expect(shouldEscalateToRecall([
      { started_at: "2026-07-07T10:00:00Z", type: "fault" },
      { started_at: "2026-07-09T10:00:00Z", type: "fault" },
    ])).toBe(false);
  });

  it("sick call-ins are excluded from repeat escalation", () => {
    expect(shouldEscalateToRecall([
      { started_at: "2026-07-08T10:00:00Z", type: "sick" },
      { started_at: "2026-07-09T10:00:00Z", type: "sick" },
    ])).toBe(false);
  });
});

describe("fault & maintenance renewals every 24hrs up to maximum of 3", () => {
  const baseExpiry = "2026-07-10T10:00:00.000Z";

  it("fault call-in with 0 renewals is eligible to renew", () => {
    const res = canRenewCallIn({
      type: "fault",
      status: "active",
      renewal_count: 0,
      expires_at: baseExpiry,
    });
    expect(res.eligible).toBe(true);
  });

  it("maintenance call-in with 1 renewal is eligible to renew", () => {
    const res = canRenewCallIn({
      type: "maintenance",
      status: "active",
      renewal_count: 1,
      expires_at: baseExpiry,
    });
    expect(res.eligible).toBe(true);
  });

  it("renewal #1 adds 24 hours to expiry and increments count to 1", () => {
    const ref = new Date("2026-07-09T12:00:00.000Z");
    const result = computeRenewal(
      {
        type: "fault",
        status: "active",
        renewal_count: 0,
        expires_at: baseExpiry,
      },
      ref
    );
    expect(result.new_renewal_count).toBe(1);
    expect(result.new_expires_at.toISOString()).toBe("2026-07-11T10:00:00.000Z");
    expect(result.should_initiate_vehicle_call_in).toBe(false);
  });

  it("renewal #2 adds another 24 hours (count becomes 2) without vehicle call-in", () => {
    const exp2 = "2026-07-11T10:00:00.000Z";
    const ref = new Date("2026-07-10T12:00:00.000Z");
    const result = computeRenewal({
      type: "maintenance",
      status: "active",
      renewal_count: 1,
      expires_at: exp2,
    }, ref);
    expect(result.new_renewal_count).toBe(2);
    expect(result.new_expires_at.toISOString()).toBe("2026-07-12T10:00:00.000Z");
    expect(result.should_initiate_vehicle_call_in).toBe(false);
  });

  it("renewal #3 reaches the maximum allowed (3) and flags vehicle call-in initiation", () => {
    const exp3 = "2026-07-12T10:00:00.000Z";
    const ref = new Date("2026-07-11T12:00:00.000Z");
    const result = computeRenewal({
      type: "fault",
      status: "active",
      renewal_count: 2,
      expires_at: exp3,
    }, ref);
    expect(result.new_renewal_count).toBe(3);
    expect(result.new_expires_at.toISOString()).toBe("2026-07-13T10:00:00.000Z");
    expect(result.should_initiate_vehicle_call_in).toBe(true);
  });

  it("cannot renew beyond maximum of 3 renewals", () => {
    const res = canRenewCallIn({
      type: "fault",
      status: "active",
      renewal_count: 3,
      expires_at: "2026-07-13T10:00:00.000Z",
    });
    expect(res.eligible).toBe(false);
    expect(res.reason).toContain("Maximum of 3 renewals reached");
  });

  it("attempting renewal when already at max (3) initiates vehicle call-in process", () => {
    const exp = "2026-07-13T10:00:00.000Z";
    const result = computeRenewal({
      type: "fault",
      status: "active",
      renewal_count: 3,
      expires_at: exp,
    });
    expect(result.new_renewal_count).toBe(3);
    expect(result.should_initiate_vehicle_call_in).toBe(true);
    expect(result.message).toContain("Vehicle call-in process initiated");
  });

  it("sick call-ins cannot use the 24h fault/maintenance renewal process", () => {
    const res = canRenewCallIn({
      type: "sick",
      status: "active",
      renewal_count: 0,
      expires_at: baseExpiry,
    });
    expect(res.eligible).toBe(false);
    expect(res.reason).toContain("Only fault and maintenance call-ins are renewable every 24hrs");
  });

  it("non-active call-ins cannot be renewed", () => {
    const res = canRenewCallIn({
      type: "fault",
      status: "cancelled",
      renewal_count: 1,
      expires_at: baseExpiry,
    });
    expect(res.eligible).toBe(false);
    expect(res.reason).toContain("Only active call-ins can be renewed");
  });
});

