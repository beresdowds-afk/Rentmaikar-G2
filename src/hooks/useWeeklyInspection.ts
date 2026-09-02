import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface InspectionReport {
  id: string;
  vehicle_id: string;
  driver_id: string;
  owner_id: string | null;
  week_start_date: string;
  submitted_at: string | null;
  photo_front_view: string | null;
  photo_back_view: string | null;
  photo_driver_side: string | null;
  photo_passenger_side: string | null;
  photo_front_right_tyre: string | null;
  photo_front_left_tyre: string | null;
  photo_back_left_tyre: string | null;
  photo_back_right_tyre: string | null;
  photo_dashboard: string | null;
  photo_interior: string | null;
  photo_timestamps: Record<string, string>;
  status: string;
  owner_reviewed_at: string | null;
  owner_notes: string | null;
  owner_action: string | null;
  admin_reviewed_at: string | null;
  admin_decision: string | null;
  admin_notes: string | null;
  admin_id: string | null;
  driver_responded_at: string | null;
  driver_accepted_withdrawal: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface ReportSettings {
  id: string;
  feature_enabled: boolean;
  report_due_day: string;
  grace_period_hours: number;
  updated_by: string | null;
  updated_at: string;
}

export interface ActiveAgreement {
  id: string;
  expires_at: string;
  renewal_count: number;
  status: string;
}

export const PHOTO_TYPES = [
  { key: 'photo_front_view', label: 'Front View', description: 'Front of vehicle' },
  { key: 'photo_back_view', label: 'Back View', description: 'Rear of vehicle' },
  { key: 'photo_driver_side', label: "Driver's Side", description: 'Left side of vehicle' },
  { key: 'photo_passenger_side', label: 'Passenger Side', description: 'Right side of vehicle' },
  { key: 'photo_front_right_tyre', label: 'Front Right Tyre', description: 'Close-up of front right tyre' },
  { key: 'photo_front_left_tyre', label: 'Front Left Tyre', description: 'Close-up of front left tyre' },
  { key: 'photo_back_left_tyre', label: 'Back Left Tyre', description: 'Close-up of back left tyre' },
  { key: 'photo_back_right_tyre', label: 'Back Right Tyre', description: 'Close-up of back right tyre' },
  { key: 'photo_dashboard', label: 'Dashboard', description: 'Dashboard and instrument panel' },
  { key: 'photo_interior', label: 'Full Interior', description: 'Full seat and interior view' },
] as const;

export type PhotoType = typeof PHOTO_TYPES[number]['key'];

/**
 * Returns the start of the current 30-day inspection period based on the agreement's expiry.
 * If no agreement, falls back to the 1st of the current month.
 */
export function get30DayPeriodStart(agreementExpiresAt?: string | null): string {
  if (agreementExpiresAt) {
    const expiry = new Date(agreementExpiresAt);
    const start = new Date(expiry);
    start.setDate(expiry.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return start.toISOString().split('T')[0];
  }
  // Fallback: 1st of current month
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/** @deprecated Use get30DayPeriodStart instead */
export function getWeekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/** @deprecated Use get30DayPeriodStart instead */
export function getMonthStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/** @deprecated */
export function getPeriodStartDate(frequency: 'weekly' | 'monthly', date: Date = new Date()): string {
  return frequency === 'monthly' ? getMonthStartDate(date) : getWeekStartDate(date);
}

export function useWeeklyInspection(vehicleId?: string, driverId?: string) {
  const { user } = useAuth();
  const effectiveDriverId = driverId || user?.id;

  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [currentReport, setCurrentReport] = useState<InspectionReport | null>(null);
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [activeAgreement, setActiveAgreement] = useState<ActiveAgreement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('weekly_report_settings')
      .select('*')
      .single();
    if (data && !error) {
      setSettings(data as ReportSettings);
    }
  };

  const fetchActiveAgreement = async () => {
    if (!effectiveDriverId) return;
    const { data } = await supabase
      .from('legal_agreements')
      .select('id, expires_at, renewal_count, status')
      .eq('driver_id', effectiveDriverId)
      .eq('is_compulsory', true)
      .in('status', ['active', 'pending_signatures'])
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveAgreement(data || null);
  };

  const fetchReports = async () => {
    if (!effectiveDriverId) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('weekly_inspection_reports')
        .select('*')
        .eq('driver_id', effectiveDriverId)
        .order('week_start_date', { ascending: false });

      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const typedData = (data || []) as InspectionReport[];
      setReports(typedData);

      // Find current 30-day period report
      const periodStart = get30DayPeriodStart(activeAgreement?.expires_at);
      const current = typedData.find(r => r.week_start_date >= periodStart);
      setCurrentReport(current || null);
    } catch (error) {
      console.error('Error fetching inspection reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadPhoto = async (
    vehicleId: string,
    photoType: PhotoType,
    file: File
  ): Promise<string | null> => {
    if (!effectiveDriverId) return null;

    const periodStart = get30DayPeriodStart(activeAgreement?.expires_at);
    const fileExt = file.name.split('.').pop();
    const filePath = `${effectiveDriverId}/${vehicleId}/${periodStart}/${photoType}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('weekly-inspection-photos')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      toast.error('Failed to upload photo');
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('weekly-inspection-photos')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const createOrUpdateReport = async (
    vehicleId: string,
    ownerId: string | null,
    photoType: PhotoType,
    photoUrl: string
  ) => {
    if (!effectiveDriverId) return null;

    const periodStart = get30DayPeriodStart(activeAgreement?.expires_at);
    const timestamp = new Date().toISOString();

    const { data: existing } = await supabase
      .from('weekly_inspection_reports')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('driver_id', effectiveDriverId)
      .eq('week_start_date', periodStart)
      .single();

    if (existing) {
      const currentTimestamps = (existing.photo_timestamps as Record<string, string>) || {};
      const { data, error } = await supabase
        .from('weekly_inspection_reports')
        .update({
          [photoType]: photoUrl,
          photo_timestamps: { ...currentTimestamps, [photoType]: timestamp },
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Update error:', error);
        toast.error('Failed to save photo');
        return null;
      }

      setCurrentReport(data as InspectionReport);
      return data;
    } else {
      const { data, error } = await supabase
        .from('weekly_inspection_reports')
        .insert({
          vehicle_id: vehicleId,
          driver_id: effectiveDriverId,
          owner_id: ownerId,
          week_start_date: periodStart,
          [photoType]: photoUrl,
          photo_timestamps: { [photoType]: timestamp },
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        toast.error('Failed to create report');
        return null;
      }

      setCurrentReport(data as InspectionReport);
      return data;
    }
  };

  const submitReport = async (reportId: string) => {
    const { error } = await supabase
      .from('weekly_inspection_reports')
      .update({ submitted_at: new Date().toISOString() })
      .eq('id', reportId);

    if (error) {
      toast.error('Failed to submit report');
      return false;
    }

    toast.success('30-day inspection report submitted!');
    fetchReports();
    return true;
  };

  const updateOwnerReview = async (
    reportId: string,
    action: 'approved' | 'recall' | 'reassignment',
    notes: string
  ) => {
    const statusMap = {
      approved: 'owner_reviewed',
      recall: 'recall_requested',
      reassignment: 'reassignment_requested',
    };

    const { error } = await supabase
      .from('weekly_inspection_reports')
      .update({
        owner_reviewed_at: new Date().toISOString(),
        owner_action: action,
        owner_notes: notes,
        status: statusMap[action],
      })
      .eq('id', reportId);

    if (error) {
      toast.error('Failed to submit review');
      return false;
    }

    toast.success(action === 'approved' ? 'Report approved!' : `Vehicle ${action} requested`);
    fetchReports();
    return true;
  };

  const updateAdminDecision = async (
    reportId: string,
    decision: string,
    notes: string
  ) => {
    if (!effectiveDriverId) return false;

    const { error } = await supabase
      .from('weekly_inspection_reports')
      .update({
        admin_reviewed_at: new Date().toISOString(),
        admin_decision: decision,
        admin_notes: notes,
        admin_id: effectiveDriverId,
        status: decision === 'approved' ? 'completed' : decision,
      })
      .eq('id', reportId);

    if (error) {
      toast.error('Failed to submit decision');
      return false;
    }

    toast.success('Decision recorded');
    fetchReports();
    return true;
  };

  const updateSettings = async (enabled: boolean) => {
    if (!effectiveDriverId) return false;

    const { error } = await supabase
      .from('weekly_report_settings')
      .update({
        feature_enabled: enabled,
        updated_by: effectiveDriverId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings?.id);

    if (error) {
      toast.error('Failed to update settings');
      return false;
    }

    setSettings(prev => prev ? { ...prev, feature_enabled: enabled } : null);
    toast.success(`Inspection reports ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  };

  useEffect(() => {
    fetchSettings();
    fetchActiveAgreement();
  }, [effectiveDriverId]);

  useEffect(() => {
    fetchReports();
  }, [effectiveDriverId, vehicleId, activeAgreement]);

  return {
    reports,
    currentReport,
    settings,
    activeAgreement,
    isLoading,
    uploadPhoto,
    createOrUpdateReport,
    submitReport,
    updateOwnerReview,
    updateAdminDecision,
    updateSettings,
    refetch: fetchReports,
    PHOTO_TYPES,
  };
}

export function useAllInspectionReports() {
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllReports = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_inspection_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports((data || []) as InspectionReport[]);
    } catch (error) {
      console.error('Error fetching all reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('weekly_report_settings')
      .select('*')
      .single();
    if (data) {
      setSettings(data as ReportSettings);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchAllReports();
  }, []);

  return {
    reports,
    settings,
    isLoading,
    refetch: fetchAllReports,
  };
}
