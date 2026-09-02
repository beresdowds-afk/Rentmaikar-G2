// Task category definitions for the admin portal

import { Scale, Cpu, Car, Users, CreditCard, AlertTriangle } from 'lucide-react';
import type { SupportTaskType } from './support';

export type TaskCategory = 
  | 'legal_operations'
  | 'iot_operations'
  | 'vehicle_operations'
  | 'user_management'
  | 'payment_operations'
  | 'incident_management';

export type TaskExecutionMode = 'delegation' | 'direct';

export interface TaskCategoryConfig {
  id: TaskCategory;
  label: string;
  description: string;
  icon: typeof Scale;
  color: string;
  supportTypes: SupportTaskType[];
  staffRoles: string[];
  delegationDescription: string;
  directDescription: string;
}

export const TASK_CATEGORIES: TaskCategoryConfig[] = [
  {
    id: 'legal_operations',
    label: 'Legal Operations',
    description: 'Document review, agreements, and compliance tasks',
    icon: Scale,
    color: 'bg-purple-500',
    supportTypes: ['legal'],
    staffRoles: ['legal_support'],
    delegationDescription: 'Assign to legal support staff for processing',
    directDescription: 'Handle legal matters directly from admin dashboard',
  },
  {
    id: 'iot_operations',
    label: 'IoT Operations',
    description: 'Device installation, maintenance, and monitoring',
    icon: Cpu,
    color: 'bg-blue-500',
    supportTypes: ['iot_installation', 'iot_maintenance'],
    staffRoles: ['iot_support'],
    delegationDescription: 'Dispatch to IoT technicians in the field',
    directDescription: 'Manage device operations from command center',
  },
  {
    id: 'vehicle_operations',
    label: 'Vehicle Operations',
    description: 'Maintenance, recalls, and inspections',
    icon: Car,
    color: 'bg-green-500',
    supportTypes: ['vehicle_recall', 'vehicle_maintenance'],
    staffRoles: ['vehicle_support'],
    delegationDescription: 'Assign to vehicle support technicians',
    directDescription: 'Coordinate vehicle operations directly',
  },
  {
    id: 'user_management',
    label: 'User Management',
    description: 'Driver/owner onboarding, verification, and access control',
    icon: Users,
    color: 'bg-orange-500',
    supportTypes: [],
    staffRoles: ['admin'],
    delegationDescription: 'N/A - Admin only function',
    directDescription: 'Manage user accounts, roles, and permissions',
  },
  {
    id: 'payment_operations',
    label: 'Payment Operations',
    description: 'Payment defaults, disputes, and reconciliation',
    icon: CreditCard,
    color: 'bg-red-500',
    supportTypes: [],
    staffRoles: ['admin'],
    delegationDescription: 'N/A - Admin only function',
    directDescription: 'Handle payment issues and defaults',
  },
  {
    id: 'incident_management',
    label: 'Incident Management',
    description: 'Accidents, emergencies, and critical issues',
    icon: AlertTriangle,
    color: 'bg-yellow-500',
    supportTypes: [],
    staffRoles: ['admin', 'vehicle_support'],
    delegationDescription: 'Escalate to support teams',
    directDescription: 'Manage incident response directly',
  },
];

export interface CategoryTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export interface SupportUserRegistration {
  email: string;
  fullName: string;
  phone?: string;
  supportType: SupportTaskType;
  assignedCity: string;
  assignedRegion: string;
}
