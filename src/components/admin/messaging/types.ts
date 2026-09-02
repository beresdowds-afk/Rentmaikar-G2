export type MessagingChannel = 'email' | 'sms' | 'whatsapp';

export interface UserContact {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  is_active?: boolean;
  country?: string | null;
}

export interface BulkSendResult {
  total: number;
  succeeded: number;
  failed: number;
  details: Array<{
    recipient: UserContact;
    success: boolean;
    error?: string;
    conversationId?: string;
  }>;
}

export interface SavedDraft {
  id: string;
  channel: MessagingChannel;
  recipientMode: 'search' | 'manual' | 'bulk';
  recipientUserId?: string | null;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  bulkRecipients?: UserContact[];
  bulkRecipientUserIds?: string[];
  emailSubject?: string;
  emailFromAlias?: string;
  emailPriority?: 'low' | 'normal' | 'high' | 'urgent';
  content: string;
  smsCountry?: string;
  smsOptOut?: boolean;
  whatsappTemplateId?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface OutboundMessagePayload {
  channel: MessagingChannel;
  recipientName: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientUserId?: string | null;
  subject?: string | null;
  fromAlias?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  content: string;
  region?: string;
  attachments?: File[];
  smsOptOut?: boolean;
  whatsappTemplateId?: string | null;
}

