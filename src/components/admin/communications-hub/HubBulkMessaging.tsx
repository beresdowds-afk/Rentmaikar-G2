import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Users,
  Send,
  Smartphone,
  MessageSquare,
  Mail,
  BellRing,
  Sparkles,
  Search,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Play,
  Square,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCommunicationsHub } from './CommunicationsHubContext';
import { renderPlaceholders } from '@/lib/reply-placeholders';
import { format } from 'date-fns';
import { calculateSmsSegments } from '@/lib/sms-templates';
import { cn } from '@/lib/utils';

type BulkChannel = 'sms' | 'whatsapp' | 'email' | 'in_app';

export interface BulkContact {
  user_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}

const BULK_TEMPLATES = [
  {
    id: 'inspection',
    title: 'Weekly Vehicle Inspection',
    channel: 'sms' as BulkChannel,
    subject: 'Action Required: Weekly Vehicle Inspection',
    body: 'Rentmaikar Alert: Hello {{first_name}}, your weekly vehicle check is due. Please submit your inspection via your driver portal today to keep your status active.',
  },
  {
    id: 'document_reminder',
    title: 'Document Update Required',
    channel: 'email' as BulkChannel,
    subject: 'Urgent: Driver License & Verification Update',
    body: 'Hello {{customer_name}},\n\nOur compliance team requires an updated copy of your documents to maintain authorized vehicle access. Please log into your driver dashboard to upload them.\n\nThank you,\nRentmaikar Fleet Operations',
  },
  {
    id: 'platform_notice',
    title: 'General Fleet Announcement',
    channel: 'whatsapp' as BulkChannel,
    subject: 'Rentmaikar Platform Notice',
    body: 'Hello {{first_name}} from Rentmaikar Admin. Important update: Please review our latest weekend dispatch protocol in your driver portal. Drive safely!',
  },
  {
    id: 'owner_payout',
    title: 'Owner Revenue Disbursement',
    channel: 'email' as BulkChannel,
    subject: 'Your Weekly Rentmaikar Revenue Statement',
    body: 'Hello {{customer_name}},\n\nYour weekly vehicle earnings statement has been generated and disbursement initiated to your verified bank account. Check your Owner Portal for full ledger details.',
  },
  {
    id: 'in_app_system',
    title: 'System In-App Broadcast',
    channel: 'in_app' as BulkChannel,
    subject: 'Scheduled Maintenance Notice',
    body: 'Notice from Administration: Platform maintenance scheduled for tonight. Active rides and GPS telematics will remain fully active.',
  },
];

const PRESET_AUDIENCES = [
  { id: 'driver_contacts', label: '📋 All Driver Contacts (600+)', role: 'driver_contacts' },
  { id: 'driver_roster_2026', label: '🚗 2026 Driver Roster (35)', role: 'driver_roster_2026' },
  { id: 'driver', label: '👤 Registered Drivers', role: 'driver' },
  { id: 'owner', label: '🏎️ Vehicle Owners & Hosts', role: 'owner' },
  { id: 'verified', label: '🛡️ Verified Platform Users', role: 'verified' },
  { id: 'unverified', label: '⏳ Pending Verification Users', role: 'unverified' },
];

export const HubBulkMessaging: React.FC = () => {
  const { bulkAudienceRole, setBulkAudienceRole, bulkRecipients, setBulkRecipients } = useCommunicationsHub();

  const [channel, setChannel] = useState<BulkChannel>('sms');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [smsOptOut, setSmsOptOut] = useState(true);

  // Audience loading
  const [isLoadingAudience, setIsLoadingAudience] = useState(false);
  const [audienceSearch, setAudienceSearch] = useState('');
  const [searchResults, setSearchResults] = useState<BulkContact[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [showRecipientList, setShowRecipientList] = useState(false);

  // Execution state
  const [isSending, setIsSending] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    completed: number;
    sent: number;
    failed: number;
    skipped: number;
    failures: { recipient: string; reason: string }[];
  } | null>(null);

  const [recipientStatuses, setRecipientStatuses] = useState<
    Record<string, { status: 'idle' | 'sending' | 'success' | 'failed'; error?: string; httpStatus?: number }>
  >({});

  const abortRef = useRef(false);

  // Fetch Audience by Preset Role
  const loadAudiencePreset = useCallback(async (roleKey: string) => {
    setIsLoadingAudience(true);
    try {
      if (roleKey === 'driver_contacts') {
        const [outreachRes, roleRowsRes] = await Promise.all([
          (supabase.from('outreach_contacts' as never) as any)
            .select('id, full_name, email, phone_e164, raw_phone')
            .eq('contact_type', 'driver')
            .order('full_name', { ascending: true })
            .limit(1500),
          supabase.from('user_roles').select('user_id').eq('role', 'driver' as never).limit(500),
        ]);

        const outreachMapped: BulkContact[] = ((outreachRes.data || []) as any[]).map((o) => ({
          user_id: o.id,
          full_name: o.full_name || 'Driver Contact',
          email: o.email || null,
          phone: o.phone_e164 || o.raw_phone || null,
          role: 'driver_contact',
        }));

        let profileMapped: BulkContact[] = [];
        const driverIds = (roleRowsRes.data || []).map((r) => r.user_id as string);
        if (driverIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, full_name, email, phone')
            .in('user_id', driverIds)
            .limit(500);
          profileMapped = ((profs || []) as any[]).map((p) => ({
            ...p,
            role: 'driver',
          }));
        }

        const seen = new Set<string>();
        const combined: BulkContact[] = [];
        for (const item of [...outreachMapped, ...profileMapped]) {
          const key = item.phone || item.email?.toLowerCase() || item.user_id;
          if (key && !seen.has(key)) {
            seen.add(key);
            combined.push(item);
          }
        }

        setBulkRecipients(combined);
        setBulkAudienceRole('driver_contacts');
        toast.success(`Loaded ${combined.length} driver contacts into bulk list`);
        return;
      }

      if (roleKey === 'driver_roster_2026') {
        const { data: roster } = await (supabase.from('outreach_contacts' as never) as any)
          .select('id, full_name, email, phone_e164, raw_phone')
          .ilike('notes', '%2026%')
          .limit(200);

        const mapped: BulkContact[] = (roster || []).map((r: any) => ({
          user_id: r.id,
          full_name: r.full_name || '2026 Driver',
          email: r.email || null,
          phone: r.phone_e164 || r.raw_phone || null,
          role: '2026_roster',
        }));

        setBulkRecipients(mapped);
        setBulkAudienceRole('driver_roster_2026');
        toast.success(`Loaded ${mapped.length} 2026 roster contacts`);
        return;
      }

      // Generic Role or verified status lookup
      if (roleKey === 'verified' || roleKey === 'unverified') {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone, is_verified')
          .eq('is_verified', roleKey === 'verified')
          .limit(500);

        const mapped: BulkContact[] = ((profs || []) as any[]).map((p) => ({
          user_id: p.user_id,
          full_name: p.full_name || p.email || 'User',
          email: p.email || null,
          phone: p.phone || null,
          role: roleKey,
        }));

        setBulkRecipients(mapped);
        setBulkAudienceRole(roleKey);
        toast.success(`Loaded ${mapped.length} ${roleKey} users`);
        return;
      }

      // Standard roles ('driver', 'owner')
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', roleKey as never)
        .limit(500);

      const userIds = (roleRows || []).map((r) => r.user_id);
      if (userIds.length === 0) {
        toast.info(`No users found with role "${roleKey}"`);
        setBulkRecipients([]);
        return;
      }

      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, phone')
        .in('user_id', userIds)
        .limit(500);

      const mapped: BulkContact[] = ((profs || []) as any[]).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name || p.email || 'User',
        email: p.email || null,
        phone: p.phone || null,
        role: roleKey,
      }));

      setBulkRecipients(mapped);
      setBulkAudienceRole(roleKey);
      toast.success(`Loaded ${mapped.length} ${roleKey} contacts`);
    } catch (err: any) {
      console.error('Failed to load audience:', err);
      toast.error('Failed to load selected audience');
    } finally {
      setIsLoadingAudience(false);
    }
  }, [setBulkAudienceRole, setBulkRecipients]);

  // Initial load if bulkAudienceRole was pre-set
  useEffect(() => {
    if (bulkAudienceRole && bulkRecipients.length === 0) {
      loadAudiencePreset(bulkAudienceRole);
    }
  }, [bulkAudienceRole, bulkRecipients.length, loadAudiencePreset]);

  // Audience directory search
  useEffect(() => {
    if (audienceSearch.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingContacts(true);
      try {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .or(`full_name.ilike.%${audienceSearch}%,email.ilike.%${audienceSearch}%,phone.ilike.%${audienceSearch}%`)
          .limit(8);

        setSearchResults((profs || []) as BulkContact[]);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearchingContacts(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [audienceSearch]);

  const handleAddRecipient = (contact: BulkContact) => {
    setBulkRecipients((prev) => {
      const exists = prev.some(
        (p) =>
          (contact.user_id && p.user_id === contact.user_id) ||
          (contact.phone && p.phone === contact.phone) ||
          (contact.email && p.email?.toLowerCase() === contact.email.toLowerCase())
      );
      if (exists) return prev;
      return [...prev, contact];
    });
    setAudienceSearch('');
    setSearchResults([]);
  };

  const handleRemoveRecipient = (identifier: string) => {
    setBulkRecipients((prev) =>
      prev.filter((p) => p.user_id !== identifier && p.phone !== identifier && p.email !== identifier)
    );
  };

  const handleClearAll = () => {
    setBulkRecipients([]);
    setBulkAudienceRole(null);
    setProgress(null);
  };

  // Audience stats
  const audienceStats = useMemo(() => {
    const total = bulkRecipients.length;
    const phoneCount = bulkRecipients.filter((r) => !!r.phone?.trim()).length;
    const emailCount = bulkRecipients.filter((r) => !!r.email?.trim()).length;
    const inAppCount = bulkRecipients.filter((r) => !!r.user_id).length;

    let usableCount = 0;
    if (channel === 'sms' || channel === 'whatsapp') usableCount = phoneCount;
    else if (channel === 'email') usableCount = emailCount;
    else if (channel === 'in_app') usableCount = inAppCount;

    return { total, phoneCount, emailCount, inAppCount, usableCount };
  }, [bulkRecipients, channel]);

  // SMS Segments calculation
  const smsSegments = useMemo(() => {
    if (channel !== 'sms') return null;
    return calculateSmsSegments(body, smsOptOut);
  }, [channel, body, smsOptOut]);

  // Insert token into body
  const handleInsertToken = (token: string) => {
    setBody((prev) => `${prev} ${token}`.trimStart());
  };

  // Apply template
  const handleApplyTemplate = (tpl: typeof BULK_TEMPLATES[0]) => {
    setChannel(tpl.channel);
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  // Safe Sequential Batch Dispatch
  const executeBulkDispatch = async () => {
    if (!body.trim()) {
      toast.error('Please compose a message body');
      return;
    }

    const usableContacts = bulkRecipients.filter((r) => {
      if (channel === 'sms' || channel === 'whatsapp') return !!r.phone?.trim();
      if (channel === 'email') return !!r.email?.trim();
      if (channel === 'in_app') return !!r.user_id;
      return false;
    });

    if (usableContacts.length === 0) {
      toast.error(`None of the selected ${bulkRecipients.length} contacts have a valid ${channel.toUpperCase()} target.`);
      return;
    }

    setIsConfirmOpen(false);
    setIsSending(true);
    abortRef.current = false;

    const initialStatuses: Record<
      string,
      { status: 'idle' | 'sending' | 'success' | 'failed'; error?: string; httpStatus?: number }
    > = {};
    usableContacts.forEach((c, idx) => {
      const k = c.user_id || c.email || c.phone || `recipient-${idx}`;
      initialStatuses[k] = { status: 'idle' };
    });
    setRecipientStatuses(initialStatuses);

    const initialProgress = {
      total: usableContacts.length,
      completed: 0,
      sent: 0,
      failed: 0,
      skipped: bulkRecipients.length - usableContacts.length,
      failures: [] as { recipient: string; reason: string }[],
    };
    setProgress(initialProgress);

    let sent = 0;
    let failed = 0;
    const failures: { recipient: string; reason: string }[] = [];

    for (let i = 0; i < usableContacts.length; i++) {
      if (abortRef.current) {
        toast.info('Bulk dispatch paused by admin.');
        break;
      }

      const contact = usableContacts[i];
      const recipientKey = contact.user_id || contact.email || contact.phone || `recipient-${i}`;
      const fullName = (contact.full_name || '').trim() || 'Customer';
      const firstName = (contact.full_name || '').trim() ? fullName.split(' ')[0] : 'there';

      // Mark recipient as currently dispatching
      setRecipientStatuses((prev) => ({
        ...prev,
        [recipientKey]: { status: 'sending' },
      }));

      // Personalize content
      const renderedMsg = renderPlaceholders(
        body.trim(),
        {
          customer_name: fullName,
          first_name: firstName,
          customer_email: contact.email || undefined,
          customer_phone: contact.phone || undefined,
          today: format(new Date(), 'dd MMM yyyy'),
        },
        { keepUnknown: true }
      );

      const renderedSubj = renderPlaceholders(
        subject.trim() || 'Notice from Rentmaikar Admin',
        {
          customer_name: fullName,
          first_name: firstName,
          today: format(new Date(), 'dd MMM yyyy'),
        },
        { keepUnknown: true }
      );

      try {
        if (channel === 'email' && contact.email) {
          const emailTarget = contact.email.trim();

          const emailPayload = {
            action: 'send',
            to: emailTarget,
            subject: renderedSubj,
            body: renderedMsg,
            recipientName: fullName !== 'Customer' ? fullName : undefined,
            category: 'general',
            templateData: {
              subject: renderedSubj,
              body: renderedMsg,
              recipientName: fullName !== 'Customer' ? fullName : undefined,
            },
          };

          // PRIMARY: Cloud Run application email gateway.
          // The backend gateway handles Supabase as the secondary fallback.
          let emailDelivered = false;
          let emailErrorMsg = '';
          let responseStatus = 200;

          try {
            const gatewayUrl = '/api/functions/send-outbound-email';
            const emailPayload = {
              to: emailTarget,
              subject: renderedSubj,
              body: renderedMsg,
              recipientName: fullName !== 'Customer' ? fullName : undefined,
            };

            let res: Response;
            try {
              res = await fetch(gatewayUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailPayload),
              });
            } catch {
              // Direct fallback to staging backend if relative proxy is unreachable
              res = await fetch('https://staging.rentmaikar.com/api/functions/send-outbound-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailPayload),
              });
            }

            responseStatus = res.status;

            const contentType = res.headers.get('content-type') || '';
            const result = contentType.includes('application/json')
              ? await res.json().catch(() => null)
              : null;

            console.group(
              `[HubBulkMessaging] 📥 Cloud Run Email Response: send-outbound-email -> ${emailTarget}`
            );
            console.log('📌 Gateway URL:', gatewayUrl);
            console.log('📌 HTTP Status:', responseStatus);
            console.log('📌 Response:', result);
            console.groupEnd();

            if (
              res.ok &&
              result?.ok !== false &&
              result?.success !== false
            ) {
              emailDelivered = true;
              emailErrorMsg = '';
            } else {
              emailDelivered = false;
              emailErrorMsg =
                result?.error ||
                result?.message ||
                `Email delivery failed with HTTP ${responseStatus}`;
            }
          } catch (invokeErr: any) {
            responseStatus =
              invokeErr?.context?.status ||
              invokeErr?.status ||
              502;

            emailDelivered = false;
            emailErrorMsg =
              invokeErr?.message ||
              `Cloud Run email gateway request failed (HTTP ${responseStatus})`;
          }

          // Strict verification: delivery must be confirmed by a successful
          // Cloud Run gateway response. The backend itself owns the
          // Supabase fallback.
          if (
            !emailDelivered ||
            responseStatus < 200 ||
            responseStatus >= 300
          ) {
            const formattedError =
              emailErrorMsg ||
              `Email delivery failed with HTTP ${responseStatus}`;

            console.error(
              `🚨 [HubBulkMessaging] Delivery failed for ${emailTarget}: ${formattedError} (Status: ${responseStatus})`
            );

            const err = new Error(formattedError);
            (err as any).status = responseStatus;
            throw err;
          }             
          setRecipientStatuses((prev) => ({
            ...prev,
            [recipientKey]: {
              status: 'success',
              httpStatus: responseStatus,
            },
          }));

          // Non-blocking conversation logging for history
          try {
            await supabase.from('inbox_messages' as never).insert({
              sender_type: 'admin',
              sender_name: 'Rentmaikar Admin',
              content: renderedMsg,
              channel: 'email',
              is_read: true,
              metadata: { bulk: true, subject: renderedSubj, recipient_email: emailTarget },
            } as never);
          } catch {
            /* non-fatal history log */
          }
        } else if ((channel === 'sms' || channel === 'whatsapp') && contact.phone) {
          const phoneTarget = contact.phone.trim();
          const isWhatsApp = channel === 'whatsapp';
          const finalSmsBody = channel === 'sms' && smsOptOut && !renderedMsg.toLowerCase().includes('stop')
            ? `${renderedMsg}\n\nReply STOP to opt out`
            : renderedMsg;

          const smsPayload = {
            phone: phoneTarget,
            message: finalSmsBody,
            channel: isWhatsApp ? 'whatsapp' : 'sms',
            recipientName: fullName !== 'Customer' ? fullName : undefined,
          };

          const supabaseBaseUrl = (supabase as any)?.supabaseUrl || 'https://jrsydiofzceoeddjogov.supabase.co';
          const functionsBaseUrl = (supabase.functions as any)?.url || `${supabaseBaseUrl}/functions/v1`;
          const exactRequestUrl = `${functionsBaseUrl}/send-sms-notification`;
          const localProxyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/functions/send-sms-notification`;

          // Comprehensive logging before supabase.functions.invoke
          console.group(`[HubBulkMessaging] 🚀 Outbound SMS Request: send-sms-notification -> ${phoneTarget}`);
          console.log('📌 Exact Request URL (Edge Function Target):', exactRequestUrl);
          console.log('📌 HTTP Method:', 'POST');
          console.log('📌 Request Payload:', smsPayload);
          console.log('📌 Potential Local Proxy / Fallback URL:', localProxyUrl);
          console.groupEnd();

          let smsSent = false;
          let smsErr = '';
          let responseStatus = 200;

          try {
            const invokeRes = await supabase.functions.invoke('send-sms-notification', {
              body: smsPayload,
            });

            if ((invokeRes as any)?.status && typeof (invokeRes as any).status === 'number') {
              responseStatus = (invokeRes as any).status;
            } else if ((invokeRes.error as any)?.context?.status && typeof (invokeRes.error as any).context.status === 'number') {
              responseStatus = (invokeRes.error as any).context.status;
            } else if ((invokeRes.error as any)?.status && typeof (invokeRes.error as any).status === 'number') {
              responseStatus = (invokeRes.error as any).status;
            } else if ((invokeRes.data as any)?.status && typeof (invokeRes.data as any).status === 'number') {
              responseStatus = (invokeRes.data as any).status;
            } else if (invokeRes.error) {
              responseStatus = 500;
            }

            console.group(`[HubBulkMessaging] 📥 Outbound SMS Response: send-sms-notification -> ${phoneTarget}`);
            console.log('📌 Checked response.status:', responseStatus);
            console.log('📌 Response Data:', invokeRes.data);
            console.log('📌 Response Error:', invokeRes.error);
            console.groupEnd();

            if (responseStatus === 405 || responseStatus < 200 || responseStatus >= 300) {
              smsSent = false;
              smsErr = responseStatus === 405
                ? 'HTTP 405 Method Not Allowed: Endpoint rejected request method or hit static proxy'
                : (invokeRes.error?.message || invokeRes.data?.error || `${channel.toUpperCase()} delivery failed (HTTP ${responseStatus})`);
            } else if (invokeRes.error) {
              smsSent = false;
              smsErr = invokeRes.error.message || `SMS Edge function returned error (HTTP ${responseStatus})`;
            } else if (invokeRes.data?.success === false || invokeRes.data?.ok === false) {
              smsSent = false;
              responseStatus = typeof invokeRes.data?.status === 'number' ? invokeRes.data.status : 400;
              smsErr = invokeRes.data?.error || invokeRes.data?.message || `${channel.toUpperCase()} delivery rejected (HTTP ${responseStatus})`;
            } else if (invokeRes.data && (invokeRes.data.success || invokeRes.data.ok)) {
              smsSent = true;
              smsErr = '';
            } else {
              smsSent = false;
              responseStatus = 500;
              smsErr = `Unexpected response format from SMS function (HTTP ${responseStatus})`;
            }
          } catch (e: any) {
            responseStatus = (e as any)?.context?.status || (e as any)?.status || 500;
            smsErr = e.message || `SMS Edge function invoke failed (HTTP ${responseStatus})`;
            smsSent = false;
          }

          if (!smsSent || responseStatus === 405 || responseStatus < 200 || responseStatus >= 300) {
            const formattedError = smsErr || `${channel.toUpperCase()} delivery failed (HTTP ${responseStatus})`;
            console.error(`🚨 [HubBulkMessaging] Delivery failed for ${phoneTarget}: ${formattedError} (Status: ${responseStatus})`);
            const err = new Error(formattedError);
            (err as any).status = responseStatus;
            throw err;
          }

          sent += 1;
          setRecipientStatuses((prev) => ({
            ...prev,
            [recipientKey]: {
              status: 'success',
              httpStatus: responseStatus,
            },
          }));

          // Non-blocking conversation logging for history
          try {
            await supabase.from('inbox_messages' as never).insert({
              sender_type: 'admin',
              sender_name: 'Rentmaikar Admin',
              content: finalSmsBody,
              channel,
              is_read: true,
              metadata: { bulk: true, recipient_phone: phoneTarget },
            } as never);
          } catch {
            /* non-fatal history log */
          }
        } else if (channel === 'in_app' && contact.user_id) {
          let inAppSent = false;
          let inAppErr = '';

          // Tier 1: Direct table insert
          try {
            const { error: insertErr } = await supabase.from('in_app_messages' as never).insert({
              recipient_id: contact.user_id,
              sender_name: 'Rentmaikar Admin',
              category: 'admin_broadcast',
              subject: renderedSubj,
              body: renderedMsg,
            } as never);
            if (!insertErr) {
              inAppSent = true;
            } else {
              inAppErr = insertErr.message;
            }
          } catch (e: any) {
            inAppErr = e.message || 'Direct table insert error';
          }

          if (!inAppSent) {
            throw new Error(inAppErr || 'In-app delivery failed');
          }

          sent += 1;
          setRecipientStatuses((prev) => ({
            ...prev,
            [recipientKey]: {
              status: 'success',
              httpStatus: 200,
            },
          }));
        } else {
          const noTargetErr = `Missing target ${channel.toUpperCase()} contact information`;
          const err = new Error(noTargetErr);
          (err as any).status = 400;
          throw err;
        }

        // Emit item activity update for real-time consoles
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('comms_activity_update', {
              detail: {
                type: 'bulk_message_item',
                channel,
                recipient: contact.email || contact.phone || fullName,
                timestamp: new Date().toISOString(),
              },
            })
          );
        }
      } catch (err: any) {
        failed += 1;
        const errMsg = err?.message || 'Dispatch error';
        const httpStatusMatch = errMsg.match(/HTTP\s+(\d{3})/i) || errMsg.match(/status\s+(\d{3})/i);
        const parsedHttpStatus = (err as any)?.status || (httpStatusMatch ? parseInt(httpStatusMatch[1], 10) : 500);

        // Update UI state to mark this specific recipient as 'failed'
        setRecipientStatuses((prev) => ({
          ...prev,
          [recipientKey]: {
            status: 'failed',
            error: errMsg,
            httpStatus: parsedHttpStatus,
          },
        }));

        failures.push({
          recipient: fullName !== 'Customer' ? `${fullName} (${contact.email || contact.phone || 'Contact'})` : (contact.email || contact.phone || 'Contact'),
          reason: errMsg,
        });
      }

      setProgress({
        total: usableContacts.length,
        completed: sent + failed,
        sent,
        failed,
        skipped: bulkRecipients.length - usableContacts.length,
        failures: [...failures],
      });

      // Small 120ms safety throttle to stay inside carrier/provider rate limits
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    setIsSending(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('comms_activity_update', {
          detail: {
            type: 'bulk_broadcast_complete',
            channel,
            totalSent: sent,
            failed,
            timestamp: new Date().toISOString(),
          },
        })
      );
    }

    if (failed === 0 && sent > 0) {
      toast.success(`Bulk dispatch complete: Delivered to all ${sent} contacts via ${channel.toUpperCase()}`);
    } else if (sent > 0) {
      toast.warning(`Bulk dispatch finished: ${sent} delivered, ${failed} failed.`);
    }
  };

  const handleBulkSend = executeBulkDispatch;

  const handleAbort = () => {
    abortRef.current = true;
  };

  return (
    <div className="space-y-3.5 text-xs">
      {/* Top Banner: Audience Selection & Quick Presets */}
      <div className="p-3 rounded-xl border bg-muted/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span>Target Audience</span>
          </div>

          <div className="flex items-center gap-2">
            {bulkRecipients.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                disabled={isSending}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              >
                Clear List
              </Button>
            )}
            <Badge variant="outline" className="text-[10px] font-mono bg-background">
              {bulkRecipients.length} Selected
            </Badge>
          </div>
        </div>

        {/* Quick Audience Preset Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_AUDIENCES.map((aud) => (
            <button
              key={aud.id}
              type="button"
              onClick={() => loadAudiencePreset(aud.role)}
              disabled={isLoadingAudience || isSending}
              className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition ${
                bulkAudienceRole === aud.role
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-background hover:bg-muted text-foreground border-border/80'
              }`}
            >
              {aud.label}
            </button>
          ))}
        </div>

        {/* Manual Contact Search Add */}
        <div className="relative pt-1">
          <Search className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={audienceSearch}
            onChange={(e) => setAudienceSearch(e.target.value)}
            placeholder="Search and add specific contact by name, phone, or email..."
            className="h-8 pl-8 text-xs bg-background"
            disabled={isSending}
          />
          {isSearchingContacts && (
            <Loader2 className="absolute right-2.5 top-3 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}

          {/* Autocomplete Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 z-30 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-40 overflow-y-auto divide-y divide-border/60">
              {searchResults.map((contact, idx) => (
                <button
                  key={contact.user_id || idx}
                  type="button"
                  onClick={() => handleAddRecipient(contact)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted/80 flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="font-semibold text-foreground">{contact.full_name || 'User'}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                      {contact.phone || contact.email}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 shrink-0">
                    + Add
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Audience Reachability Metrics Bar */}
        {bulkRecipients.length > 0 && (
          <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span title="Contacts with phone number">
                📞 <strong>{audienceStats.phoneCount}</strong> phones
              </span>
              <span title="Contacts with email address">
                ✉️ <strong>{audienceStats.emailCount}</strong> emails
              </span>
              <span title="Registered platform user accounts">
                👤 <strong>{audienceStats.inAppCount}</strong> accounts
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowRecipientList((prev) => !prev)}
              className="text-primary hover:underline flex items-center gap-1 font-medium"
            >
              {showRecipientList ? 'Hide List' : 'Inspect Roster'}
              {showRecipientList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        )}

        {/* Expandable Recipient Chip Roster */}
        {showRecipientList && bulkRecipients.length > 0 && (
          <div className="max-h-36 overflow-y-auto p-2 bg-background rounded-lg border border-border/70 flex flex-wrap gap-1.5">
            {bulkRecipients.slice(0, 100).map((r, i) => {
              const rKey = r.user_id || r.phone || r.email || `recipient-${i}`;
              const rStatus = recipientStatuses[rKey];
              return (
                <span
                  key={rKey}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-md border transition-colors',
                    rStatus?.status === 'failed'
                      ? 'bg-destructive/15 text-destructive border-destructive/40 font-medium'
                      : rStatus?.status === 'success'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                        : rStatus?.status === 'sending'
                          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30 animate-pulse'
                          : 'bg-muted/80 text-foreground border-border'
                  )}
                  title={rStatus?.error ? `Server Error: ${rStatus.error}` : undefined}
                >
                  {rStatus?.status === 'sending' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  {rStatus?.status === 'success' && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />}
                  {rStatus?.status === 'failed' && <AlertCircle className="h-2.5 w-2.5 text-destructive" />}
                  <span>{r.full_name || r.phone || r.email || 'Contact'}</span>
                  {rStatus?.status === 'failed' && (
                    <span className="text-[9px] bg-destructive/20 text-destructive px-1 rounded font-mono font-bold">
                      {rStatus.httpStatus ? `HTTP ${rStatus.httpStatus}` : 'Failed'}
                    </span>
                  )}
                  {!isSending && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(r.user_id || r.phone || r.email || '')}
                      className="hover:text-destructive ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </span>
              );
            })}
            {bulkRecipients.length > 100 && (
              <span className="text-[10px] text-muted-foreground self-center px-1">
                +{bulkRecipients.length - 100} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Channel Switcher */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">Delivery Channel</Label>
        <div className="grid grid-cols-4 gap-1.5">
          <Button
            type="button"
            variant={channel === 'sms' ? 'default' : 'outline'}
            onClick={() => setChannel('sms')}
            className="h-8 text-xs gap-1.5 px-2"
            disabled={isSending}
          >
            <Smartphone className="h-3.5 w-3.5 text-amber-500" />
            <span>SMS</span>
          </Button>
          <Button
            type="button"
            variant={channel === 'whatsapp' ? 'default' : 'outline'}
            onClick={() => setChannel('whatsapp')}
            className="h-8 text-xs gap-1.5 px-2"
            disabled={isSending}
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
            <span>WhatsApp</span>
          </Button>
          <Button
            type="button"
            variant={channel === 'email' ? 'default' : 'outline'}
            onClick={() => setChannel('email')}
            className="h-8 text-xs gap-1.5 px-2"
            disabled={isSending}
          >
            <Mail className="h-3.5 w-3.5 text-blue-600" />
            <span>Email</span>
          </Button>
          <Button
            type="button"
            variant={channel === 'in_app' ? 'default' : 'outline'}
            onClick={() => setChannel('in_app')}
            className="h-8 text-xs gap-1.5 px-2"
            disabled={isSending}
          >
            <BellRing className="h-3.5 w-3.5 text-purple-600" />
            <span>In-App</span>
          </Button>
        </div>
      </div>

      {/* Subject Line for Email & In-App */}
      {(channel === 'email' || channel === 'in_app') && (
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-muted-foreground">Subject Line</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Urgent Update for Rentmaikar Fleet"
            className="h-8 text-xs bg-background"
            disabled={isSending}
          />
        </div>
      )}

      {/* Message Body & Segment Counter */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-muted-foreground">Message Content</Label>
          <span className="text-[10px] text-muted-foreground font-mono">
            {body.length} chars
            {smsSegments && ` · ${smsSegments.segments} SMS segment${smsSegments.segments > 1 ? 's' : ''}`}
          </span>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compose bulk announcement or reminder..."
          rows={4}
          className="text-xs bg-background resize-none"
          disabled={isSending}
        />
      </div>

      {/* Live Placeholder Tokens */}
      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        <span className="text-muted-foreground font-medium">Insert:</span>
        <button
          type="button"
          onClick={() => handleInsertToken('{{customer_name}}')}
          className="px-2 py-0.5 rounded border bg-muted/70 hover:bg-muted text-foreground transition"
        >
          {'{customer_name}'}
        </button>
        <button
          type="button"
          onClick={() => handleInsertToken('{{first_name}}')}
          className="px-2 py-0.5 rounded border bg-muted/70 hover:bg-muted text-foreground transition"
        >
          {'{first_name}'}
        </button>
        <button
          type="button"
          onClick={() => handleInsertToken('{{today}}')}
          className="px-2 py-0.5 rounded border bg-muted/70 hover:bg-muted text-foreground transition"
        >
          {'{today}'}
        </button>
      </div>

      {/* Quick Bulk Templates */}
      <div className="space-y-1 pt-1">
        <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>Preset Broadcast Templates</span>
        </Label>
        <div className="flex flex-wrap gap-1.5 max-h-18 overflow-y-auto">
          {BULK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleApplyTemplate(tpl)}
              disabled={isSending}
              className="text-[10px] bg-muted/60 hover:bg-muted text-foreground border border-border/70 rounded-md px-2 py-0.5 transition truncate max-w-[210px]"
            >
              {tpl.title}
            </button>
          ))}
        </div>
      </div>

      {/* Live Dispatch Progress Bar (When dispatching or completed) */}
      {progress && (
        <div className="p-3 rounded-xl border bg-card space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              {isSending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Transmitting batch to {progress.total} recipients...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Batch dispatch completed</span>
                </>
              )}
            </span>

            <span className="font-mono text-[11px] text-muted-foreground">
              {progress.completed} / {progress.total} (
              {Math.round((progress.completed / (progress.total || 1)) * 100)}%)
            </span>
          </div>

          <Progress
            value={(progress.completed / (progress.total || 1)) * 100}
            className="h-2"
          />

          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <span className="text-emerald-600 font-semibold">✓ {progress.sent} Sent</span>
              {progress.failed > 0 && (
                <span className="text-destructive font-semibold">✕ {progress.failed} Failed</span>
              )}
              {progress.skipped > 0 && (
                <span className="text-muted-foreground">⊘ {progress.skipped} Skipped</span>
              )}
            </div>

            {isSending && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={handleAbort}
                className="h-6 px-2 text-[10px] gap-1"
              >
                <Square className="h-2.5 w-2.5" /> Stop Blast
              </Button>
            )}
          </div>

          {/* Failure Audit Log (if any) */}
          {progress.failures.length > 0 && (
            <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] space-y-1">
              <div className="flex items-center justify-between font-bold text-destructive">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Dispatch Failures ({progress.failures.length})
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  Inspect details below or check browser console logs
                </span>
              </div>
              <div className="space-y-1 pt-1 divide-y divide-destructive/20">
                {progress.failures.map((f, idx) => (
                  <div key={idx} className="pt-1 first:pt-0 flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground text-[10px]">{f.recipient}</span>
                    <span className="text-[10px] text-destructive/90 font-mono break-words bg-background/50 px-1.5 py-0.5 rounded border border-destructive/20">
                      {f.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send Actions Bar */}
      <div className="pt-2">
        <Button
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          disabled={isSending || !body.trim() || bulkRecipients.length === 0}
          className="w-full h-9 text-xs font-semibold gap-2 bg-primary text-primary-foreground shadow-md"
        >
          {isSending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Dispatching Bulk Batch ({progress?.completed || 0}/{progress?.total || 0})...</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>
                Dispatch Bulk {channel.toUpperCase()} to {audienceStats.usableCount} Contacts
              </span>
            </>
          )}
        </Button>
      </div>

      {/* Safety Confirmation Dialog */}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Bulk Message Dispatch
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs text-muted-foreground pt-1">
              <p>
                You are preparing to broadcast a message to{' '}
                <strong className="text-foreground">{audienceStats.usableCount} verified contacts</strong> via{' '}
                <strong className="text-foreground">{channel.toUpperCase()}</strong>.
              </p>
              {audienceStats.total > audienceStats.usableCount && (
                <p className="text-amber-600 dark:text-amber-400">
                  ⚠️ Note: {audienceStats.total - audienceStats.usableCount} contacts will be skipped due to missing {channel === 'email' ? 'email' : 'phone'} information.
                </p>
              )}
              <div className="p-2.5 rounded-lg border bg-muted/60 text-foreground font-mono text-[11px] whitespace-pre-wrap max-h-32 overflow-y-auto">
                {body}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeBulkDispatch}
              className="bg-primary text-primary-foreground font-semibold"
            >
              Confirm & Launch Blast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
