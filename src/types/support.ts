// Support task types and interfaces

export type SupportTaskType = 'legal' | 'iot_installation' | 'iot_maintenance' | 'vehicle_recall' | 'vehicle_maintenance' | 'insurance';

export type InsuranceTaskStatus = 'open' | 'reviewing' | 'awaiting_documents' | 'quote_sent' | 'escalated' | 'resolved' | 'closed';

export type VerificationState = 'not_submitted' | 'pending_verification' | 'verified' | 'rejected';

export type LegalTaskStatus = 'open' | 'document_review' | 'pending_signature' | 'escalated' | 'resolved' | 'closed';

export type IoTTaskStatus = 'assigned' | 'scheduled' | 'in_transit' | 'on_site' | 'installation_complete' | 'testing' | 'completed' | 'failed';

export type VehicleTaskStatus = 'reported' | 'dispatched' | 'inspection' | 'repair_in_progress' | 'pending_parts' | 'quality_check' | 'completed' | 'escalated';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportStaff {
  id: string;
  user_id: string;
  support_type: SupportTaskType;
  assigned_city: string;
  assigned_region: string;
  is_active: boolean;
  phone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  profile?: {
    full_name: string;
    email: string;
  };
}

export interface SupportTask {
  id: string;
  task_type: SupportTaskType;
  title: string;
  description?: string;
  priority: TaskPriority;
  
  // Status fields (one per type)
  legal_status?: LegalTaskStatus;
  iot_status?: IoTTaskStatus;
  vehicle_status?: VehicleTaskStatus;
  insurance_status?: InsuranceTaskStatus;

  // Staff feedback / admin verification
  verification_state?: VerificationState;
  staff_feedback?: string;
  staff_resolved_at?: string;
  staff_resolved_by?: string;
  verified_at?: string;
  verified_by?: string;
  verification_notes?: string;
  
  // Assignment
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: string;
  city: string;
  region: string;
  
  // Related entities
  vehicle_id?: string;
  driver_id?: string;
  owner_id?: string;
  device_id?: string;
  recall_id?: string;
  agreement_id?: string;
  
  // Location details
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  
  // Scheduling
  scheduled_date?: string;
  scheduled_time?: string;
  estimated_duration_hours?: number;
  
  // Resolution
  resolution_notes?: string;
  resolved_at?: string;
  resolved_by?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined fields
  assigned_staff?: SupportStaff;
  vehicle?: {
    make: string;
    model: string;
    year: number;
    license_plate: string;
  };
  device?: {
    serial_number: string;
    device_model: string;
    status: string;
  };
}

export interface SupportTaskUpdate {
  id: string;
  task_id: string;
  user_id: string;
  update_type: 'status_change' | 'note' | 'feedback' | 'escalation' | 'resolution';
  previous_status?: string;
  new_status?: string;
  content: string;
  attachments?: any[];
  created_at: string;
  // Joined fields
  user_profile?: {
    full_name: string;
    email: string;
  };
}

// Status configurations for each dashboard
export const LEGAL_STATUS_CONFIG: Record<LegalTaskStatus, { label: string; color: string; icon: string }> = {
  open: { label: 'Open', color: 'bg-blue-500', icon: 'FileText' },
  document_review: { label: 'Document Review', color: 'bg-yellow-500', icon: 'Search' },
  pending_signature: { label: 'Pending Signature', color: 'bg-orange-500', icon: 'PenTool' },
  escalated: { label: 'Escalated', color: 'bg-red-500', icon: 'AlertTriangle' },
  resolved: { label: 'Resolved', color: 'bg-green-500', icon: 'CheckCircle' },
  closed: { label: 'Closed', color: 'bg-gray-500', icon: 'XCircle' },
};

export const IOT_STATUS_CONFIG: Record<IoTTaskStatus, { label: string; color: string; icon: string }> = {
  assigned: { label: 'Assigned', color: 'bg-blue-500', icon: 'UserCheck' },
  scheduled: { label: 'Scheduled', color: 'bg-purple-500', icon: 'Calendar' },
  in_transit: { label: 'In Transit', color: 'bg-yellow-500', icon: 'Truck' },
  on_site: { label: 'On Site', color: 'bg-orange-500', icon: 'MapPin' },
  installation_complete: { label: 'Installation Complete', color: 'bg-teal-500', icon: 'Wrench' },
  testing: { label: 'Testing', color: 'bg-indigo-500', icon: 'Activity' },
  completed: { label: 'Completed', color: 'bg-green-500', icon: 'CheckCircle' },
  failed: { label: 'Failed', color: 'bg-red-500', icon: 'XCircle' },
};

export const VEHICLE_STATUS_CONFIG: Record<VehicleTaskStatus, { label: string; color: string; icon: string }> = {
  reported: { label: 'Reported', color: 'bg-blue-500', icon: 'FileText' },
  dispatched: { label: 'Dispatched', color: 'bg-purple-500', icon: 'Truck' },
  inspection: { label: 'Inspection', color: 'bg-yellow-500', icon: 'Search' },
  repair_in_progress: { label: 'Repair in Progress', color: 'bg-orange-500', icon: 'Wrench' },
  pending_parts: { label: 'Pending Parts', color: 'bg-red-500', icon: 'Package' },
  quality_check: { label: 'Quality Check', color: 'bg-teal-500', icon: 'ClipboardCheck' },
  completed: { label: 'Completed', color: 'bg-green-500', icon: 'CheckCircle' },
  escalated: { label: 'Escalated', color: 'bg-red-600', icon: 'AlertTriangle' },
};

export const INSURANCE_STATUS_CONFIG: Record<InsuranceTaskStatus, { label: string; color: string; icon: string }> = {
  open: { label: 'Open', color: 'bg-blue-500', icon: 'FileText' },
  reviewing: { label: 'Reviewing', color: 'bg-yellow-500', icon: 'Search' },
  awaiting_documents: { label: 'Awaiting Documents', color: 'bg-orange-500', icon: 'Upload' },
  quote_sent: { label: 'Quote Sent', color: 'bg-indigo-500', icon: 'Send' },
  escalated: { label: 'Escalated', color: 'bg-red-500', icon: 'AlertTriangle' },
  resolved: { label: 'Resolved', color: 'bg-green-500', icon: 'CheckCircle' },
  closed: { label: 'Closed', color: 'bg-gray-500', icon: 'XCircle' },
};

export const VERIFICATION_STATE_CONFIG: Record<VerificationState, { label: string; color: string }> = {
  not_submitted: { label: 'Awaiting Feedback', color: 'bg-muted text-foreground' },
  pending_verification: { label: 'Pending Admin Verification', color: 'bg-amber-500 text-white' },
  verified: { label: 'Verified by Admin', color: 'bg-green-600 text-white' },
  rejected: { label: 'Sent Back for Rework', color: 'bg-destructive text-destructive-foreground' },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-gray-500' },
  medium: { label: 'Medium', color: 'bg-blue-500' },
  high: { label: 'High', color: 'bg-orange-500' },
  urgent: { label: 'Urgent', color: 'bg-red-500' },
};

// Helper to get cities by region
export const CITIES_BY_REGION: Record<string, string[]> = {
  'Nigeria': ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'Benin City', 'Enugu'],
  'USA': ['Washington DC', 'Baltimore', 'Silver Spring', 'Arlington', 'Alexandria', 'Richmond'],
};
