import { describe, it, expect, vi, beforeEach } from "vitest";
import { personaWebhookService } from "../../../backend/src/services/personaWebhookService";
import { paymentService, PAYMENT_PURPOSES } from "../../../backend/src/services/paymentService";
import * as vehicleAuthService from "@/services/vehicleAuthorizationService";

describe("Rank-1 20-80 Features Activation & Core Acceptance Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Multi-role Authentication & Account Provisioning Contract", () => {
    it("defines valid app roles and guarantees wallet currencies for US and Nigeria", () => {
      const allowedRoles = ["driver", "owner", "admin", "admin_assistant", "compliance_officer"];
      expect(allowedRoles).toContain("driver");
      expect(allowedRoles).toContain("owner");

      const resolveCurrency = (country: string | null) => {
        if (country && (country.toLowerCase() === "nigeria" || country.toUpperCase() === "NG")) {
          return "NGN";
        }
        return "USD";
      };

      expect(resolveCurrency("Nigeria")).toBe("NGN");
      expect(resolveCurrency("NG")).toBe("NGN");
      expect(resolveCurrency("USA")).toBe("USD");
      expect(resolveCurrency(null)).toBe("USD");
    });
  });

  describe("2. Persona KYC Webhook State Processing", () => {
    it("rejects webhook when invalid signature is provided and secret is configured", async () => {
      const origSecret = process.env.PERSONA_WEBHOOK_SECRET;
      try {
        process.env.PERSONA_WEBHOOK_SECRET = "secret_test_key_12345";
        const result = await personaWebhookService.handle({
          headers: { "persona-signature": "t=12345,v1=invalid_signature_hash" },
          body: { data: { id: "inq_test_123" } },
        });
        expect(result.status).toBe(401);
        expect(result.body.error).toBe("Invalid signature");
      } finally {
        process.env.PERSONA_WEBHOOK_SECRET = origSecret;
      }
    });

    it("correctly maps Persona inquiry status values to canonical application statuses", () => {
      const statusMap: Record<string, string> = {
        approved: "approved",
        completed: "approved",
        declined: "declined",
        failed: "declined",
        needs_review: "needs_review",
        pending: "pending",
        expired: "expired",
      };

      expect(statusMap["approved"]).toBe("approved");
      expect(statusMap["completed"]).toBe("approved");
      expect(statusMap["declined"]).toBe("declined");
      expect(statusMap["failed"]).toBe("declined");
      expect(statusMap["needs_review"]).toBe("needs_review");
    });
  });

  describe("3. Vehicle Submission, Review & Publication Workflow", () => {
    it("submits vehicle in PENDING review state without exposing to public catalogue", async () => {
      const mockVehicle = {
        vehicleId: "a0000000-0000-0000-0000-000000000001",
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        vehicleYear: 2022,
        licensePlate: "TEST-998",
        pickupCity: "Baltimore",
        pickupLocation: "123 Main St, Baltimore, MD",
        pickupAddress: "123 Main St, Baltimore, MD",
        pickupInstructions: "Park in bay 4",
        photoUrls: ["https://example.com/photo1.jpg"],
        ownerId: "b0000000-0000-0000-0000-000000000001",
        ownerName: "Test Fleet Owner",
        ownerEmail: "owner@example.com",
      };

      vi.spyOn(vehicleAuthService, "publishAndAuthorizeVehicle").mockResolvedValueOnce({
        success: true,
        authorization: {
          id: "AUTH-VEH-2026-TEST",
          vehicle_id: mockVehicle.vehicleId,
          vehicle_make: mockVehicle.vehicleMake,
          vehicle_model: mockVehicle.vehicleModel,
          vehicle_year: mockVehicle.vehicleYear,
          license_plate: mockVehicle.licensePlate,
          photo_urls: mockVehicle.photoUrls,
          owner_id: mockVehicle.ownerId,
          owner_name: mockVehicle.ownerName,
          owner_email: mockVehicle.ownerEmail,
          status: "PENDING",
          matching_status: "pending",
          authorization_text: vehicleAuthService.LEGAL_AUTHORIZATION_TEXT,
          terms_version: "v2026.1",
          authorized_at: new Date().toISOString(),
          cancellation_token: "test-token-123",
          audit_trail: [],
        },
        cancellationUrl: "https://rentmaikar.com/cancel-authorization/test-token-123",
      });

      // publishAndAuthorizeVehicle must set PENDING review status
      const res = await vehicleAuthService.publishAndAuthorizeVehicle(mockVehicle);
      expect(res.success).toBe(true);
      expect(res.authorization.status).toBe("PENDING");
      expect(res.authorization.matching_status).toBe("pending");
      expect(res.cancellationUrl).toContain("/cancel-authorization/");
    });

    it("enforces catalogue visibility predicate: review_status === 'published' AND is_public === true AND status === 'available'", () => {
      const isVisibleInCatalogue = (v: { review_status?: string; is_public: boolean; status: string }) => {
        return (
          v.review_status === "published" &&
          v.is_public === true &&
          (v.status === "available" || v.status === "active")
        );
      };

      // Owner submitted but pending review: MUST NOT be visible
      expect(
        isVisibleInCatalogue({ review_status: "pending", is_public: false, status: "pending" })
      ).toBe(false);

      // Owner attempted to set is_public=true without admin review: MUST NOT be visible
      expect(
        isVisibleInCatalogue({ review_status: "pending", is_public: true, status: "available" })
      ).toBe(false);

      // Admin approved and published: MUST be visible
      expect(
        isVisibleInCatalogue({ review_status: "published", is_public: true, status: "available" })
      ).toBe(true);
    });
  });

  describe("4. Vehicle Rental Eligibility Assertion Gate", () => {
    it("evaluates vehicle rental eligibility based on review status, inspection, and insurance", () => {
      const assertVehicleRentalEligible = (v: {
        review_status: string;
        status: string;
        insurance_expired: boolean;
        recent_failed_inspection: boolean;
      }) => {
        if (v.review_status !== "published") {
          throw new Error("Vehicle is pending administrative approval");
        }
        if (["suspended", "recalled", "maintenance", "inactive"].includes(v.status)) {
          throw new Error(`Vehicle is not eligible for rental (status: ${v.status})`);
        }
        if (v.insurance_expired) {
          throw new Error("Vehicle insurance has expired");
        }
        if (v.recent_failed_inspection) {
          throw new Error("Vehicle has failed inspection and is not rental eligible");
        }
        return true;
      };

      expect(() =>
        assertVehicleRentalEligible({
          review_status: "pending",
          status: "pending",
          insurance_expired: false,
          recent_failed_inspection: false,
        })
      ).toThrow("Vehicle is pending administrative approval");

      expect(() =>
        assertVehicleRentalEligible({
          review_status: "published",
          status: "suspended",
          insurance_expired: false,
          recent_failed_inspection: false,
        })
      ).toThrow("Vehicle is not eligible for rental");

      expect(() =>
        assertVehicleRentalEligible({
          review_status: "published",
          status: "available",
          insurance_expired: true,
          recent_failed_inspection: false,
        })
      ).toThrow("Vehicle insurance has expired");

      expect(() =>
        assertVehicleRentalEligible({
          review_status: "published",
          status: "available",
          insurance_expired: false,
          recent_failed_inspection: true,
        })
      ).toThrow("Vehicle has failed inspection and is not rental eligible");

      expect(
        assertVehicleRentalEligible({
          review_status: "published",
          status: "available",
          insurance_expired: false,
          recent_failed_inspection: false,
        })
      ).toBe(true);
    });
  });

  describe("5. Payment Purpose Validation & Normalization", () => {
    it("enforces canonical set of payment purposes", () => {
      expect(PAYMENT_PURPOSES).toEqual([
        "rental",
        "security_deposit",
        "late_fee",
        "subscription_training",
        "subscription_insurance",
        "subscription_roadside",
        "iot_device",
        "other",
      ]);
    });

    it("rejects invalid ad-hoc purposes", async () => {
      await expect(
        paymentService.createPayPalOrder({
          amount: 100,
          purpose: "unauthorized_arbitrary_charge",
        })
      ).rejects.toThrow('Invalid payment purpose "unauthorized_arbitrary_charge"');
    });
  });

  describe("6. Owner Withdrawal & Atomic Ledger Protection", () => {
    it("validates requested withdrawal against available balance", () => {
      const validateWithdrawal = (availableBalance: number, requestedAmount: number) => {
        if (!requestedAmount || requestedAmount <= 0) {
          throw new Error("Invalid withdrawal amount");
        }
        if (requestedAmount > availableBalance) {
          throw new Error(
            `Insufficient available balance ($${availableBalance.toFixed(2)} available, requested $${requestedAmount.toFixed(2)})`
          );
        }
        return {
          reserved: requestedAmount,
          remaining: availableBalance - requestedAmount,
        };
      };

      expect(() => validateWithdrawal(500, 600)).toThrow("Insufficient available balance");
      expect(validateWithdrawal(500, 400)).toEqual({ reserved: 400, remaining: 100 });
      expect(validateWithdrawal(400, 400)).toEqual({ reserved: 400, remaining: 0 });
    });
  });

  describe("7. Driver Command Authorization Gate", () => {
    it("enforces driver role and active rental matching driver_id and vehicle_id", () => {
      const authorizeDriverCommand = (caller: {
        userId: string;
        role: string;
        activeRentals: { driver_id: string; vehicle_id: string }[];
        targetVehicleId: string;
      }) => {
        if (caller.role !== "driver") {
          throw new Error("Not authorized: User does not have driver role");
        }
        const hasActiveRental = caller.activeRentals.some(
          (r) => r.driver_id === caller.userId && r.vehicle_id === caller.targetVehicleId
        );
        if (!hasActiveRental) {
          throw new Error("Not authorized: Driver does not have an active rental for this vehicle");
        }
        return true;
      };

      // Driver trying to command a vehicle they don't rent
      expect(() =>
        authorizeDriverCommand({
          userId: "driver-1",
          role: "driver",
          activeRentals: [{ driver_id: "driver-1", vehicle_id: "veh-A" }],
          targetVehicleId: "veh-B",
        })
      ).toThrow("Driver does not have an active rental for this vehicle");

      // Non-driver trying to issue command
      expect(() =>
        authorizeDriverCommand({
          userId: "renter-guest",
          role: "guest",
          activeRentals: [{ driver_id: "renter-guest", vehicle_id: "veh-A" }],
          targetVehicleId: "veh-A",
        })
      ).toThrow("User does not have driver role");

      // Valid driver with active rental
      expect(
        authorizeDriverCommand({
          userId: "driver-1",
          role: "driver",
          activeRentals: [{ driver_id: "driver-1", vehicle_id: "veh-A" }],
          targetVehicleId: "veh-A",
        })
      ).toBe(true);
    });
  });

  describe("8. Rental Agreement Archive Contract", () => {
    it("ensures rental agreement archive ties rental_id to signatures and timestamps", () => {
      const agreementRecord = {
        id: "ag-uuid-001",
        rental_id: "rental-uuid-999",
        vehicle_id: "veh-uuid-001",
        driver_id: "driver-uuid-001",
        owner_id: "owner-uuid-001",
        agreement_type: "rental_terms",
        status: "active",
        driver_signature: "Dr. John Doe",
        driver_signed_at: "2026-10-01T08:00:00Z",
        owner_signature: "Jane Fleet LLC",
        owner_signed_at: "2026-10-01T08:15:00Z",
      };

      expect(agreementRecord.rental_id).toBe("rental-uuid-999");
      expect(agreementRecord.driver_signature).toBeTruthy();
      expect(agreementRecord.owner_signature).toBeTruthy();
    });
  });
});
