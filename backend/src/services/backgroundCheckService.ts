import { getDbPool } from "./dbPool";

export interface InitiateBackgroundCheckInput {
  driverId: string;
  checkType?: "criminal_mvr" | "police_clearance" | "driving_record";
  provider?: string;
  consentId?: string;
  driverDetails?: {
    legalFirstName?: string;
    legalLastName?: string;
    dob?: string;
    ssnLast4?: string;
    driversLicenseNumber?: string;
    driversLicenseState?: string;
  };
}

export interface BackgroundCheckRecord {
  id: string;
  driverId: string;
  provider: string;
  providerCaseId: string | null;
  checkType: string;
  status: "pending" | "consent_required" | "submitted" | "processing" | "clear" | "consider" | "adverse" | "expired" | "failed";
  consentId: string | null;
  resultSummary: Record<string, unknown>;
  initiatedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export class BackgroundCheckService {
  /**
   * Initiates a criminal and driving record background screening check for a driver.
   */
  static async initiateCheck(input: InitiateBackgroundCheckInput): Promise<BackgroundCheckRecord> {
    const pool = getDbPool();
    const checkType = input.checkType || "criminal_mvr";
    const provider = input.provider || (checkType === "police_clearance" ? "npf_portal" : "checkr_partner");

    // Check if there is already an active or clear check for this driver
    const existing = await pool.query(
      `
        SELECT * FROM public.driver_background_checks
        WHERE driver_id = $1 AND check_type = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.driverId, checkType]
    );

    if (existing.rowCount && existing.rows[0]) {
      const row = existing.rows[0];
      const isStillValid = row.status === "clear" && (!row.expires_at || new Date(row.expires_at) > new Date());
      if (isStillValid) {
        return this.mapRow(row);
      }
    }

    // In a live integration, dispatch request to Checkr / Persona / NPF API
    const providerCaseId = `bcheck_${Date.now()}_${input.driverId.slice(0, 8)}`;
    
    // We register the check in 'processing' status with 1-year standard renewal validity window
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const insertRes = await pool.query(
      `
        INSERT INTO public.driver_background_checks (
          driver_id,
          provider,
          provider_case_id,
          check_type,
          status,
          consent_id,
          result_summary,
          initiated_at,
          expires_at
        ) VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7, $8)
        RETURNING *
      `,
      [
        input.driverId,
        provider,
        providerCaseId,
        checkType,
        input.consentId || null,
        JSON.stringify({
          screening_packages: ["ssn_trace", "national_criminal_search", "sex_offender_registry", "mvr_driving_record"],
          jurisdiction: input.driverDetails?.driversLicenseState || "US",
          initiated_source: "rentmaikar_onboarding_pipeline",
        }),
        now.toISOString(),
        expiresAt.toISOString(),
      ]
    );

    return this.mapRow(insertRes.rows[0]);
  }

  /**
   * Fetches latest background check status for a driver.
   */
  static async getStatus(driverId: string): Promise<BackgroundCheckRecord | null> {
    const pool = getDbPool();
    const res = await pool.query(
      `
        SELECT * FROM public.driver_background_checks
        WHERE driver_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [driverId]
    );

    if (!res.rowCount) return null;
    return this.mapRow(res.rows[0]);
  }

  /**
   * Evaluates the complete comprehensive driver activation gate:
   * 1. Identity verified
   * 2. Background check clear
   * 3. Rideshare platform registration verified
   * 4. Required documents verified
   * 5. Referee attestation satisfied
   * 6. Driver training completed and active
   */
  static async assertDriverActivationEligible(driverId: string): Promise<{
    eligible: boolean;
    reasons: string[];
    checks: Record<string, boolean>;
  }> {
    const pool = getDbPool();
    const checks: Record<string, boolean> = {
      identity_verified: false,
      background_clear: false,
      rideshare_approved: false,
      documents_verified: false,
      referees_satisfied: false,
      training_complete: false,
    };
    const reasons: string[] = [];

    // Query platform switch for Persona and Criminal/Background checks
    let personaEnforced = true;
    let bgCheckEnforced = true;
    try {
      const settingRes = await pool.query(
        `SELECT value FROM public.platform_kv_settings WHERE key = 'persona_verification' LIMIT 1`
      );
      if (settingRes.rows.length > 0) {
        const val = settingRes.rows[0].value;
        if (val && typeof val === "object") {
          const master = val.enabled === true;
          personaEnforced = val.identity_verification_enabled !== undefined
            ? val.identity_verification_enabled === true
            : master;
          bgCheckEnforced = val.background_check_enabled !== undefined
            ? val.background_check_enabled === true
            : master;
        }
      } else {
        personaEnforced = false;
        bgCheckEnforced = false;
      }
    } catch {
      personaEnforced = false;
      bgCheckEnforced = false;
    }

    // 1. Identity Verification
    if (!personaEnforced) {
      checks.identity_verified = true;
    } else {
      const profileRes = await pool.query(
        `SELECT identity_verification_status, identity_verified_at FROM public.profiles WHERE user_id = $1`,
        [driverId]
      );
      if (
        profileRes.rows[0]?.identity_verification_status === "completed" ||
        profileRes.rows[0]?.identity_verified_at
      ) {
        checks.identity_verified = true;
      } else {
        reasons.push("Identity verification not completed");
      }
    }

    // 2. Background Check
    if (!bgCheckEnforced) {
      checks.background_clear = true;
    } else {
      const bgRes = await pool.query(
        `
          SELECT status, expires_at FROM public.driver_background_checks
          WHERE driver_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [driverId]
      );
      if (
        bgRes.rows[0]?.status === "clear" &&
        (!bgRes.rows[0].expires_at || new Date(bgRes.rows[0].expires_at) > new Date())
      ) {
        checks.background_clear = true;
      } else {
        reasons.push("Criminal & background check is not cleared");
      }
    }

    // 3. Rideshare Platform Approval
    const appRes = await pool.query(
      `SELECT rideshare_platform_status, status FROM public.applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [driverId]
    );
    if (appRes.rows[0]?.status === "approved" || appRes.rows[0]?.rideshare_platform_status === "approved") {
      checks.rideshare_approved = true;
    } else {
      reasons.push("Rideshare platform credentials or application not approved");
    }

    // 4. Required Documents
    const docsRes = await pool.query(
      `
        SELECT COUNT(*) FILTER (WHERE status = 'verified') as verified_count,
               COUNT(*) as total_count
        FROM public.user_documents
        WHERE user_id = $1
      `,
      [driverId]
    );
    const verifiedDocs = parseInt(docsRes.rows[0]?.verified_count || "0", 10);
    if (verifiedDocs >= 1) {
      checks.documents_verified = true;
    } else {
      reasons.push("Required identity/licensing documents not verified");
    }

    // 5. Referee Attestations
    const refRes = await pool.query(
      `
        SELECT COUNT(*) FILTER (WHERE attestation_status = 'attested_positive') as positive_count,
               COUNT(*) FILTER (WHERE attestation_status = 'attested_negative') as negative_count
        FROM public.referee_verifications rv
        JOIN public.applications a ON a.id = rv.application_id
        WHERE a.user_id = $1
      `,
      [driverId]
    );
    const negativeCount = parseInt(refRes.rows[0]?.negative_count || "0", 10);
    const positiveCount = parseInt(refRes.rows[0]?.positive_count || "0", 10);
    if (negativeCount === 0 && positiveCount >= 1) {
      checks.referees_satisfied = true;
    } else {
      reasons.push("Referee attestations not satisfied or received negative attestation");
    }

    // 6. Driver Training
    const trainRes = await pool.query(
      `
        SELECT
          COUNT(DISTINCT tc.module_id) = (SELECT COUNT(*) FROM public.training_modules WHERE is_active = true) as all_modules_done
        FROM public.training_completions tc
        JOIN public.training_modules tm ON tm.id = tc.module_id
        WHERE tc.user_id = $1
          AND tm.is_active = true
          AND tc.verification_status = 'verified'
          AND (tc.expires_at IS NULL OR tc.expires_at > now())
      `,
      [driverId]
    );
    if (trainRes.rows[0]?.all_modules_done) {
      checks.training_complete = true;
    } else {
      reasons.push("Driver training modules incomplete, unverified, or expired");
    }

    const eligible = reasons.length === 0;
    return { eligible, reasons, checks };
  }

  private static mapRow(row: any): BackgroundCheckRecord {
    return {
      id: row.id,
      driverId: row.driver_id,
      provider: row.provider,
      providerCaseId: row.provider_case_id,
      checkType: row.check_type,
      status: row.status,
      consentId: row.consent_id,
      resultSummary: typeof row.result_summary === "object" ? row.result_summary : {},
      initiatedAt: row.initiated_at,
      completedAt: row.completed_at,
      expiresAt: row.expires_at,
    };
  }
}
