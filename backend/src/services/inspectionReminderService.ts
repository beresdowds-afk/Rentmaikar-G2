import { getDbPool } from "./dbPool";
import { supabaseBackendService } from "./supabaseService";
import { sendEmailViaResend } from "./emailService";

export interface InspectionSchedule {
  vehicleId: string;
  vehicleName?: string;
  driverId: string;
  ownerId?: string | null;
  periodStart: string;
  dueDate: string;
  reminderWindowStart: string;
  daysRemaining: number;
  isInReminderWindow: boolean;
  isOverdue: boolean;
  isSubmitted: boolean;
  isApproved: boolean;
  cycleState: "upcoming" | "due_soon" | "overdue" | "submitted" | "approved";
  currentReportId?: string | null;
  renewalCount: number;
}

export interface ReminderProcessResult {
  ok: boolean;
  success: boolean;
  agreementsScanned: number;
  notifiedCount: number;
  skippedAlreadyNotified: number;
  skippedAlreadySubmitted: number;
  errors: string[];
}

export class InspectionReminderService {
  /**
   * Calculates the 30-day inspection schedule for a driver and vehicle.
   */
  async getInspectionSchedule(params: {
    vehicleId?: string;
    driverId: string;
  }): Promise<InspectionSchedule | null> {
    const pool = getDbPool();
    const admin = supabaseBackendService.getAdminClient();

    let agreement: any = null;

    try {
      const q = params.vehicleId
        ? `
            SELECT id, vehicle_id, driver_id, owner_id, expires_at, renewal_count, status
            FROM public.legal_agreements
            WHERE driver_id = $1 AND vehicle_id = $2 AND is_compulsory = true AND status IN ('active', 'pending_signatures')
            ORDER BY expires_at DESC
            LIMIT 1
          `
        : `
            SELECT id, vehicle_id, driver_id, owner_id, expires_at, renewal_count, status
            FROM public.legal_agreements
            WHERE driver_id = $1 AND is_compulsory = true AND status IN ('active', 'pending_signatures')
            ORDER BY expires_at DESC
            LIMIT 1
          `;
      const args = params.vehicleId ? [params.driverId, params.vehicleId] : [params.driverId];
      const res = await pool.query(q, args);
      if (res.rowCount > 0) agreement = res.rows[0];
    } catch {
      let query = admin
        .from("legal_agreements")
        .select("id, vehicle_id, driver_id, owner_id, expires_at, renewal_count, status")
        .eq("driver_id", params.driverId)
        .eq("is_compulsory", true)
        .in("status", ["active", "pending_signatures"])
        .order("expires_at", { ascending: false })
        .limit(1);
      if (params.vehicleId) query = query.eq("vehicle_id", params.vehicleId);
      const { data } = await query.maybeSingle();
      agreement = data;
    }

    const now = new Date();
    let dueDate: Date;
    let periodStart: string;

    if (agreement?.expires_at) {
      dueDate = new Date(agreement.expires_at);
      const start = new Date(dueDate);
      start.setDate(dueDate.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      periodStart = start.toISOString().split("T")[0];
    } else {
      // Fallback: 30 days from 1st of month
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      periodStart = start.toISOString().split("T")[0];
      dueDate = new Date(start);
      dueDate.setDate(start.getDate() + 30);
    }

    const reminderWindowStart = new Date(dueDate);
    reminderWindowStart.setDate(dueDate.getDate() - 7);

    const targetVehicleId = params.vehicleId || agreement?.vehicle_id || "";

    // Check for existing report in this period
    let currentReport: any = null;
    if (targetVehicleId) {
      try {
        const rRes = await pool.query(
          `
            SELECT id, status, submitted_at
            FROM public.weekly_inspection_reports
            WHERE vehicle_id = $1 AND driver_id = $2 AND week_start_date >= $3
            ORDER BY week_start_date DESC
            LIMIT 1
          `,
          [targetVehicleId, params.driverId, periodStart]
        );
        if (rRes.rowCount > 0) currentReport = rRes.rows[0];
      } catch {
        const { data } = await admin
          .from("weekly_inspection_reports")
          .select("id, status, submitted_at")
          .eq("vehicle_id", targetVehicleId)
          .eq("driver_id", params.driverId)
          .gte("week_start_date", periodStart)
          .order("week_start_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        currentReport = data;
      }
    }

    const isSubmitted = !!currentReport?.submitted_at;
    const isApproved = currentReport?.status === "approved" || currentReport?.status === "completed";
    const isInReminderWindow = now >= reminderWindowStart && now <= dueDate;
    const isOverdue = now > dueDate && !isSubmitted;

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / msPerDay);

    let cycleState: InspectionSchedule["cycleState"] = "upcoming";
    if (isApproved) cycleState = "approved";
    else if (isSubmitted) cycleState = "submitted";
    else if (isOverdue) cycleState = "overdue";
    else if (isInReminderWindow) cycleState = "due_soon";

    return {
      vehicleId: targetVehicleId,
      driverId: params.driverId,
      ownerId: agreement?.owner_id || null,
      periodStart,
      dueDate: dueDate.toISOString(),
      reminderWindowStart: reminderWindowStart.toISOString(),
      daysRemaining,
      isInReminderWindow,
      isOverdue,
      isSubmitted,
      isApproved,
      cycleState,
      currentReportId: currentReport?.id || null,
      renewalCount: agreement?.renewal_count || 0,
    };
  }

  /**
   * Process and dispatch automated inspection reminders (7-day advance notice & overdue escalation)
   */
  async processInspectionReminders(options: { forceRun?: boolean } = {}): Promise<ReminderProcessResult> {
    const pool = getDbPool();
    const admin = supabaseBackendService.getAdminClient();

    const today = new Date();
    const sevenDaysOut = new Date(today);
    sevenDaysOut.setDate(today.getDate() + 7);

    const sevenDayStart = new Date(sevenDaysOut);
    sevenDayStart.setHours(0, 0, 0, 0);
    const sevenDayEnd = new Date(sevenDaysOut);
    sevenDayEnd.setHours(23, 59, 59, 999);

    const result: ReminderProcessResult = {
      ok: true,
      success: true,
      agreementsScanned: 0,
      notifiedCount: 0,
      skippedAlreadyNotified: 0,
      skippedAlreadySubmitted: 0,
      errors: [],
    };

    // 1. Fetch active agreements due in ~7 days
    let agreements: any[] = [];
    try {
      const agRes = await pool.query(
        `
          SELECT id, driver_id, owner_id, vehicle_id, expires_at, renewal_count
          FROM public.legal_agreements
          WHERE is_compulsory = true
            AND status IN ('active', 'pending_signatures')
            AND expires_at >= $1
            AND expires_at <= $2
        `,
        [sevenDayStart.toISOString(), sevenDayEnd.toISOString()]
      );
      agreements = agRes.rows;
    } catch {
      const { data } = await admin
        .from("legal_agreements")
        .select("id, driver_id, owner_id, vehicle_id, expires_at, renewal_count")
        .eq("is_compulsory", true)
        .in("status", ["active", "pending_signatures"])
        .gte("expires_at", sevenDayStart.toISOString())
        .lte("expires_at", sevenDayEnd.toISOString());
      agreements = data || [];
    }

    result.agreementsScanned = agreements.length;

    for (const agreement of agreements) {
      if (!agreement.vehicle_id || !agreement.driver_id) continue;

      try {
        // 2. Check if a report was already submitted for this vehicle & period
        const periodStart = new Date(agreement.expires_at);
        periodStart.setDate(periodStart.getDate() - 30);
        periodStart.setHours(0, 0, 0, 0);

        const rRes = await pool.query(
          `
            SELECT id, submitted_at
            FROM public.weekly_inspection_reports
            WHERE vehicle_id = $1 AND driver_id = $2 AND week_start_date >= $3 AND submitted_at IS NOT NULL
            LIMIT 1
          `,
          [agreement.vehicle_id, agreement.driver_id, periodStart.toISOString().split("T")[0]]
        );

        if (rRes.rowCount > 0) {
          result.skippedAlreadySubmitted++;
          continue;
        }

        // 3. Deduplication: check if already notified within past 48 hours
        if (!options.forceRun) {
          const notifRes = await pool.query(
            `
              SELECT id FROM public.expiry_notifications
              WHERE vehicle_id = $1
                AND notification_type = 'inspection_30day'
                AND recipient_id = $2
                AND created_at >= now() - interval '48 hours'
              LIMIT 1
            `,
            [agreement.vehicle_id, agreement.driver_id]
          );

          if (notifRes.rowCount > 0) {
            result.skippedAlreadyNotified++;
            continue;
          }
        }

        // 4. Fetch Driver details for email
        let driverEmail = "";
        let driverName = "Driver";
        try {
          const uRes = await pool.query(
            `SELECT email, raw_user_meta_data FROM auth.users WHERE id = $1 LIMIT 1`,
            [agreement.driver_id]
          );
          if (uRes.rowCount > 0) {
            driverEmail = uRes.rows[0].email;
            driverName = uRes.rows[0].raw_user_meta_data?.full_name || "Valued Driver";
          }
        } catch {
          // fallback
        }

        // 5. Send Transactional Reminder Email
        if (driverEmail) {
          const dueDateFormatted = new Date(agreement.expires_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          await sendEmailViaResend({
            to: driverEmail,
            subject: `Action Required: Monthly Vehicle Inspection Due in 7 Days (${dueDateFormatted})`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a; margin-top: 0;">Monthly Inspection Reminder</h2>
                <p>Hello ${driverName},</p>
                <p>Your mandatory 30-day vehicle inspection cycle for your active rental agreement is due on <strong>${dueDateFormatted}</strong> (in 7 days).</p>
                <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
                  <h4 style="margin: 0 0 8px 0; color: #334155;">Required Inspection Steps:</h4>
                  <ul style="margin: 0; padding-left: 20px; color: #475569;">
                    <li>Capture all 10 required exterior and interior photo angles</li>
                    <li>Ensure adequate daytime lighting and clear tyre tread visibility</li>
                    <li>Submit the report via your Driver Dashboard</li>
                  </ul>
                </div>
                <p style="color: #64748b; font-size: 14px;">Automated visual damage detection will verify your photos against baseline reference images upon submission.</p>
                <p style="margin-top: 24px;">Thank you for driving safely with RentMaikar.</p>
              </div>
            `,
          }).catch((err) => {
            console.warn("[InspectionReminderService] Email dispatch warning:", err.message);
          });
        }

        // 6. Record notification to public.expiry_notifications
        try {
          await pool.query(
            `
              INSERT INTO public.expiry_notifications (
                vehicle_id,
                recipient_id,
                notification_type,
                delivery_status,
                metadata
              ) VALUES (
                $1, $2, 'inspection_30day', 'sent', $3
              )
            `,
            [
              agreement.vehicle_id,
              agreement.driver_id,
              JSON.stringify({
                agreementId: agreement.id,
                expiresAt: agreement.expires_at,
                renewalCount: agreement.renewal_count,
              }),
            ]
          );
        } catch {
          // ignore notification record errors
        }

        result.notifiedCount++;
      } catch (err: any) {
        result.errors.push(`Agreement ${agreement.id}: ${err?.message}`);
      }
    }

    return result;
  }
}

export const inspectionReminderService = new InspectionReminderService();
