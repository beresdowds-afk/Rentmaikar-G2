import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { toast } from 'sonner';
import { renderPlaceholders, type PlaceholderValues } from '@/lib/reply-placeholders';
import { looksLikeOtpMessage, OTP_IN_APP_BLOCK_MESSAGE } from '@/lib/otp-guard';

/**
 * Placeholder values we can resolve straight from the composer form. Anything
 * that needs rental/vehicle context (vehicle, booking dates, rates) is resolved
 * server-side from the conversation before dispatch.
 */
const composerPlaceholderValues = (
  input: { recipientName?: string; email?: string; phone?: string },
  region: string | null | undefined,
): PlaceholderValues => {
  const name = (input.recipientName || '').trim();
  return {
    customer_name: name || 'there',
    first_name: name ? name.split(' ')[0] : 'there',
    customer_email: input.email?.trim() || '',
    customer_phone: input.phone?.trim() || '',
    region: region || '',
    today: new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  };
};


export type ComposerChannel = 'email' | 'sms' | 'whatsapp' | 'in_app';

export interface RecipientOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ComposerDraft {
  id: string;
  channel: ComposerChannel;
  recipientUserId: string | null;
  recipientName: string;
  email: string;
  phone: string;
  subject: string;
  body: string;
  savedAt: string;
}

const DRAFT_KEY = 'rentmaikar_message_drafts';

const readDrafts = (): ComposerDraft[] => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ComposerDraft[]) : [];
  } catch {
    return [];
  }
};

const writeDrafts = (drafts: ComposerDraft[]) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts.slice(0, 50)));
  } catch {
    /* storage unavailable — drafts are best effort */
  }
};

/** Local, per-device drafts for the messaging center composer. */
export const useMessageDrafts = () => {
  const [drafts, setDrafts] = useState<ComposerDraft[]>([]);

  useEffect(() => {
    setDrafts(readDrafts());
  }, []);

  const saveDraft = useCallback((draft: Omit<ComposerDraft, 'id' | 'savedAt'> & { id?: string }) => {
    const entry: ComposerDraft = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      savedAt: new Date().toISOString(),
    };
    setDrafts((prev) => {
      const next = [entry, ...prev.filter((d) => d.id !== entry.id)];
      writeDrafts(next);
      return next;
    });
    return entry;
  }, []);

  const deleteDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeDrafts(next);
      return next;
    });
  }, []);

  return { drafts, saveDraft, deleteDraft };
};

/** Search platform users so staff can pick a recipient instead of typing raw contacts. */
export const useRecipientSearch = (query: string) => {
  const [results, setResults] = useState<RecipientOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const cleanQ = q.replace(/[%,]/g, '').trim();
      const like = `%${cleanQ}%`;
      const normalizedQ = cleanQ.toLowerCase();

      const isDriverContactsAll = [
        'driver contacts',
        'driver contact',
        'driver_contacts',
        'driver-contacts',
        'driver contacts list',
        'all driver contacts',
        'all drivers',
      ].some((k) => normalizedQ === k || normalizedQ.includes('driver contact'));

      const is2026Batch = [
        'driver_contacts_update_2026',
        '#drivers',
        'drivers-2026',
        'drivers_2026',
        'driver-roster',
        'driver_roster',
        '2026 driver',
        '2026-driver',
      ].some((k) => normalizedQ.includes(k)) || normalizedQ === 'drivers 2026';

      try {
        if (isDriverContactsAll) {
          // Pull all 600+ driver contacts from outreach and platform profiles
          const [outreachRes, profilesRes] = await Promise.all([
            (supabase.from('outreach_contacts' as never) as any)
              .select('id, full_name, email, phone_e164, raw_phone, source')
              .eq('contact_type', 'driver')
              .order('full_name', { ascending: true })
              .limit(1500),
            supabase
              .from('user_roles')
              .select('user_id, profiles(user_id, full_name, email, phone)')
              .eq('role', 'driver')
              .limit(500),
          ]);

          if (cancelled) return;

          const outreachMapped: RecipientOption[] = ((outreachRes.data || []) as any[]).map((o) => ({
            user_id: o.id,
            full_name: o.full_name || 'Driver Contact',
            email: o.email || null,
            phone: o.phone_e164 || o.raw_phone || null,
          }));

          const profileMapped: RecipientOption[] = ((profilesRes.data || []) as any[])
            .map((r: any) => r.profiles)
            .filter(Boolean)
            .map((p: any) => ({
              user_id: p.user_id,
              full_name: p.full_name || 'Registered Driver',
              email: p.email || null,
              phone: p.phone || null,
            }));

          const seen = new Set<string>();
          const combined: RecipientOption[] = [];
          for (const item of [...outreachMapped, ...profileMapped]) {
            const key = item.phone || item.email?.toLowerCase() || item.user_id;
            if (key && !seen.has(key)) {
              seen.add(key);
              combined.push(item);
            }
          }
          setResults(combined);
        } else if (is2026Batch) {
          // Explicitly pull all 35 contacts from the 2026 driver roster batch
          const { data: outreach, error: oErr } = await (supabase.from('outreach_contacts' as never) as any)
            .select('id, full_name, email, phone_e164, raw_phone, source')
            .or('source.eq.driver_contacts_update_2026,notes.ilike.%#drivers%')
            .order('full_name', { ascending: true })
            .limit(100);

          if (cancelled) return;
          if (oErr) console.error('Outreach batch search failed:', oErr);
          const mapped: RecipientOption[] = (outreach || []).map((o: any) => ({
            user_id: o.id,
            full_name: o.full_name || 'Driver Contact',
            email: o.email || null,
            phone: o.phone_e164 || o.raw_phone || null,
          }));
          setResults(mapped);
        } else {
          // Query both profiles and outreach_contacts for unified discovery
          const [profilesRes, outreachRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('user_id, full_name, email, phone')
              .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
              .limit(10),
            (supabase.from('outreach_contacts' as never) as any)
              .select('id, full_name, email, phone_e164, raw_phone, source, notes')
              .or(`full_name.ilike.${like},email.ilike.${like},phone_e164.ilike.${like},raw_phone.ilike.${like},source.ilike.${like},notes.ilike.${like}`)
              .limit(20),
          ]);

          if (cancelled) return;
          const profileRecipients: RecipientOption[] = (profilesRes.data || []) as RecipientOption[];
          const outreachRecipients: RecipientOption[] = ((outreachRes.data || []) as any[]).map((o) => ({
            user_id: o.id,
            full_name: o.full_name || 'Driver Outreach',
            email: o.email || null,
            phone: o.phone_e164 || o.raw_phone || null,
          }));

          // Deduplicate by email/phone or id
          const seen = new Set<string>();
          const combined: RecipientOption[] = [];
          for (const item of [...profileRecipients, ...outreachRecipients]) {
            const key = item.email?.toLowerCase() || item.phone || item.user_id;
            if (key && !seen.has(key)) {
              seen.add(key);
              combined.push(item);
            }
          }
          setResults(combined);
        }
      } catch (err) {
        console.error('Recipient search failed:', err);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, isSearching };
};

/** Bulk audience helper: pull every contact holding a given platform role or batch roster. */
export const useRoleRecipients = () => {
  const [isLoading, setIsLoading] = useState(false);

  const fetchByRole = useCallback(async (role: string, limit = 500): Promise<RecipientOption[]> => {
    setIsLoading(true);

    // Special audience: All 600+ Driver Contacts (outreach + registered)
    if (role === 'driver_contacts' || role === 'driver') {
      try {
        const [outreachRes, roleRowsRes] = await Promise.all([
          (supabase.from('outreach_contacts' as never) as any)
            .select('id, full_name, email, phone_e164, raw_phone')
            .eq('contact_type', 'driver')
            .order('full_name', { ascending: true })
            .limit(1500),
          supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'driver' as never)
            .limit(500),
        ]);

        const outreachMapped: RecipientOption[] = ((outreachRes.data || []) as any[]).map((o) => ({
          user_id: o.id,
          full_name: o.full_name || 'Driver Contact',
          email: o.email || null,
          phone: o.phone_e164 || o.raw_phone || null,
        }));

        let profileMapped: RecipientOption[] = [];
        const driverIds = (roleRowsRes.data || []).map((r) => r.user_id as string);
        if (driverIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, full_name, email, phone')
            .in('user_id', driverIds)
            .limit(500);
          profileMapped = (profs || []) as RecipientOption[];
        }

        const seen = new Set<string>();
        const combined: RecipientOption[] = [];
        for (const item of [...outreachMapped, ...profileMapped]) {
          const key = item.phone || item.email?.toLowerCase() || item.user_id;
          if (key && !seen.has(key)) {
            seen.add(key);
            combined.push(item);
          }
        }
        return combined;
      } catch (err) {
        console.error('Failed to load all driver contacts audience:', err);
        toast.error('Could not load driver contacts');
        return [];
      } finally {
        setIsLoading(false);
      }
    }

    // Special roster audience: 2026 driver outreach update list
    if (role === 'driver_contacts_update_2026' || role === 'driver_roster_2026') {
      try {
        const { data, error } = await (supabase.from('outreach_contacts' as never) as any)
          .select('id, full_name, email, phone_e164, raw_phone')
          .or('source.eq.driver_contacts_update_2026,notes.ilike.%#drivers%')
          .order('full_name', { ascending: true })
          .limit(limit);
        if (error) throw error;
        return (data || []).map((o: any) => ({
          user_id: o.id,
          full_name: o.full_name || 'Driver Contact',
          email: o.email || null,
          phone: o.phone_e164 || o.raw_phone || null,
        }));
      } catch (err) {
        console.error('Failed to load 2026 driver roster audience:', err);
        toast.error('Could not load 2026 driver contacts');
        return [];
      } finally {
        setIsLoading(false);
      }
    }

    try {
      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', role as never)
        .limit(limit);
      if (roleError) throw roleError;
      const ids = (roleRows || []).map((r) => r.user_id as string);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, phone')
        .in('user_id', ids)
        .limit(limit);
      if (error) throw error;
      return (data || []) as RecipientOption[];
    } catch (err) {
      console.error('Failed to load role recipients:', err);
      toast.error('Could not load that audience');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { fetchByRole, isLoading };
};

export interface SendComposedInput {
  channel: ComposerChannel;
  recipientUserId?: string | null;
  recipientName?: string;
  email?: string;
  phone?: string;
  subject?: string;
  body: string;
  whatsappTemplateId?: string;
}

export interface BulkRecipient {
  user_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface BulkProgress {
  total: number;
  completed: number;
  sent: number;
  failed: number;
  failures?: { recipient: string; reason: string }[];
}

/** Outcome of a single composed send: whether the provider actually took it. */
export interface SendOutcome {
  /** The message row exists in the unified inbox thread. */
  saved: boolean;
  /** The channel provider accepted the message for delivery. */
  delivered: boolean;
  reason?: string;
}

/** inbox_conversations.region only accepts these two values. */
const toConversationRegion = (country: string | undefined, phone: string): 'USA' | 'Nigeria' => {
  if (country === 'USA') return 'USA';
  if (country === 'Nigeria' || country === 'NGN' || country === 'NG') return 'Nigeria';
  return phone.replace(/[^\d+]/g, '').startsWith('+234') ? 'Nigeria' : 'USA';
};

/**
 * Sends an outbound message on any channel, reusing the unified inbox as the
 * single store: it finds or creates the conversation, records the message, then
 * dispatches through the channel's edge function so replies thread back.
 */
export const useSendComposedMessage = () => {
  const { user } = useAuth();
  const { country } = useRegion();
  const [isSending, setIsSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

  const send = async (
    input: SendComposedInput,
    opts?: { silent?: boolean },
  ): Promise<SendOutcome> => {
    const silent = opts?.silent === true;
    const notifyError = (msg: string) => {
      if (!silent) toast.error(msg);
    };


    // Fill in every placeholder we can resolve from the recipient before the
    // message is stored or handed to a provider. Unresolved tokens are left for
    // the edge function to resolve from the conversation.
    const placeholderValues = composerPlaceholderValues(input, country);
    const body = renderPlaceholders(input.body.trim(), placeholderValues, { keepUnknown: true });
    const renderedSubject = renderPlaceholders(input.subject?.trim() || '', placeholderValues, {
      keepUnknown: true,
    }).trim();
    if (!body) {
      notifyError('Write a message first');
      return { saved: false, delivered: false, reason: 'Empty message' };
    }
    const email = input.email?.trim() || '';
    const phone = input.phone?.trim() || '';
    if (input.channel === 'email' && !email) {
      notifyError('An email address is required');
      return { saved: false, delivered: false, reason: 'Missing email address' };
    }
    if (input.channel === 'in_app' && !input.recipientUserId) {
      notifyError('Pick a registered user — in-app messages need an account');
      return { saved: false, delivered: false, reason: 'Missing platform account' };
    }
    if (input.channel !== 'email' && input.channel !== 'in_app' && !phone) {
      notifyError('A phone number is required');
      return { saved: false, delivered: false, reason: 'Missing phone number' };
    }

    // ── In-app messaging: stored in the user's app inbox + web push ──
    if (input.channel === 'in_app') {
      // Never deliver one-time passcodes to an already-authenticated surface.
      if (looksLikeOtpMessage(body) || looksLikeOtpMessage(renderedSubject)) {
        notifyError(OTP_IN_APP_BLOCK_MESSAGE);
        return { saved: false, delivered: false, reason: OTP_IN_APP_BLOCK_MESSAGE };
      }
      setIsSending(true);
      try {
        let delivered = false;
        let deliverErr = '';

        // Tier 1: Supabase edge function invoke
        try {
          const { data, error } = await supabase.functions.invoke('send-in-app-message', {
            body: {
              recipient_ids: [input.recipientUserId],
              subject: renderedSubject || undefined,
              body,
              category: 'support',
            },
          });
          if (!error && (data?.ok !== false && data?.success !== false)) {
            delivered = true;
          } else {
            deliverErr = (data as any)?.error || (error as any)?.message || 'Edge function rejected in-app message';
          }
        } catch (invokeErr: any) {
          deliverErr = invokeErr?.message || 'Edge function invoke error';
        }

        // Tier 2: Resilient local API gateway fallback
        if (!delivered) {
          try {
            const fallbackRes = await fetch('/api/functions/send-in-app-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient_ids: [input.recipientUserId],
                subject: renderedSubject || undefined,
                body,
                category: 'support',
              }),
            });
            const json = await fallbackRes.json().catch(() => null);
            if (fallbackRes.ok && (json?.ok !== false && json?.success !== false)) {
              delivered = true;
              deliverErr = '';
            } else {
              deliverErr = json?.error || deliverErr || `In-app delivery failed (HTTP ${fallbackRes.status})`;
            }
          } catch (fbErr: any) {
            deliverErr = fbErr?.message || deliverErr;
          }
        }

        // Tier 3: Direct database insert fallback
        if (!delivered && input.recipientUserId) {
          try {
            const { error: insertErr } = await supabase.from('in_app_messages' as never).insert({
              recipient_id: input.recipientUserId,
              sender_name: 'Rentmaikar Support',
              category: 'support',
              subject: renderedSubject || 'Support Notification',
              body,
            } as never);
            if (!insertErr) {
              delivered = true;
              deliverErr = '';
            }
          } catch {
            // direct insert failed
          }
        }

        if (!delivered) {
          notifyError(`Could not deliver the in-app message: ${deliverErr}`);
          return { saved: false, delivered: false, reason: deliverErr };
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('comms_activity_update', {
              detail: {
                channel: 'in_app',
                recipient: input.recipientUserId,
                type: 'in_app_message_delivered',
                timestamp: new Date().toISOString(),
              },
            })
          );
        }

        if (!silent) toast.success('In-app message delivered');
        return { saved: true, delivered: true };
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        notifyError(`Could not deliver the in-app message: ${reason}`);
        return { saved: false, delivered: false, reason };
      } finally {
        if (!silent) setIsSending(false);
      }
    }



    setIsSending(true);
    try {
      // ── Find an existing live conversation for this contact + channel ──
      let query = supabase
        .from('inbox_conversations')
        .select('id')
        .eq('channel', input.channel)
        .is('archived_at', null)
        .order('last_message_at', { ascending: false })
        .limit(1);

      if (input.recipientUserId) query = query.eq('user_id', input.recipientUserId);
      else if (input.channel === 'email') query = query.eq('user_email', email);
      else query = query.eq('user_phone', phone);

      const { data: existing } = await query.maybeSingle();
      let conversationId = existing?.id as string | undefined;

      if (!conversationId) {
        const { data: created, error: createError } = await supabase
          .from('inbox_conversations')
          .insert({
            user_id: input.recipientUserId || null,
            user_name: input.recipientName || null,
            user_email: email || null,
            user_phone: phone || null,
            channel: input.channel,
            subject: renderedSubject || 'Message from Rentmaikar',
            status: 'pending',
            priority: 'normal',
            region: toConversationRegion(country, phone),
          })
          .select('id')
          .single();
        if (createError) throw createError;
        conversationId = created.id as string;
      }

      const { error: messageError } = await supabase.from('inbox_messages').insert({
        conversation_id: conversationId,
        sender_type: 'admin',
        sender_id: user?.id ?? null,
        sender_name: 'Rentmaikar Support',
        content: body,
        channel: input.channel,
        is_read: true,
      });
      if (messageError) throw messageError;

      await supabase
        .from('inbox_conversations')
        .update({ last_message_at: new Date().toISOString(), status: 'pending' })
        .eq('id', conversationId);

      // ── Dispatch on the wire ──
      let dispatchOk = false;
      let deliveryError: string | null = null;
      let deliveredMessageId: string | undefined;

      try {
        if (input.channel === 'email') {
          // Attempt 1: Invoke send-email-reply edge function
          const { data, error } = await supabase.functions.invoke('send-email-reply', {
            body: {
              conversationId,
              messageContent: body,
              recipientEmail: email,
              subject: renderedSubject || undefined,
            },
          });

          if (!error && (data?.success || data?.ok)) {
            dispatchOk = true;
            deliveredMessageId = data?.messageId;
          } else {
            deliveryError = data?.error || error?.message || 'Edge function delivery warning';
          }

          // Attempt 2: Resilient direct local API gateway fallback
          if (!dispatchOk) {
            try {
              const fallbackRes = await fetch('/api/functions/send-email-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  conversationId,
                  recipientEmail: email,
                  subject: renderedSubject || undefined,
                  messageContent: body,
                }),
              });
              const fallbackJson = await fallbackRes.json().catch(() => null);
              if (fallbackRes.ok && (fallbackJson?.success || fallbackJson?.ok)) {
                dispatchOk = true;
                deliveredMessageId = fallbackJson?.messageId;
                deliveryError = null;
              } else {
                deliveryError = fallbackJson?.error || `Email delivery failed with HTTP ${fallbackRes.status}`;
              }
            } catch (fbErr: any) {
              deliveryError = fbErr.message || deliveryError || 'Email delivery failed';
            }
          }
        } else {
          // SMS or WhatsApp channel dispatch
          const { data, error } = await supabase.functions.invoke('send-inbox-reply', {
            body: {
              conversationId,
              messageContent: body,
              channel: input.channel,
              recipientPhone: phone,
              whatsappTemplateId: input.channel === 'whatsapp' ? input.whatsappTemplateId : undefined,
            },
          });

          if (!error && (data?.success || data?.ok)) {
            dispatchOk = true;
            deliveredMessageId = data?.messageId;
          } else {
            deliveryError = data?.error || error?.message || 'Provider rejected message';
          }

          // Direct local fallback for SMS/WhatsApp
          if (!dispatchOk) {
            try {
              const fallbackRes = await fetch('/api/functions/send-inbox-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  conversationId,
                  messageContent: body,
                  channel: input.channel,
                  recipientPhone: phone,
                  whatsappTemplateId: input.channel === 'whatsapp' ? input.whatsappTemplateId : undefined,
                }),
              });
              const fallbackJson = await fallbackRes.json().catch(() => null);
              if (fallbackRes.ok && (fallbackJson?.success || fallbackJson?.ok)) {
                dispatchOk = true;
                deliveredMessageId = fallbackJson?.messageId;
                deliveryError = null;
              } else {
                deliveryError = fallbackJson?.error || `Dispatch failed with HTTP ${fallbackRes.status}`;
              }
            } catch (fbErr: any) {
              deliveryError = fbErr.message || deliveryError || 'Message delivery failed';
            }
          }
        }
      } catch (invokeErr: any) {
        deliveryError = invokeErr?.message || 'Wire dispatch exception';
      }

      if (!dispatchOk) {
        console.error('Dispatch failed for recipient:', { email, phone, error: deliveryError });
        const reason = deliveryError || 'Provider rejected the message';
        notifyError(`Saved to the thread, but delivery failed: ${reason}`);
        return { saved: true, delivered: false, reason };
      }

      // ── Update conversation state & synchronize activities across the application ──
      try {
        await supabase
          .from('inbox_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            status: 'active',
          })
          .eq('id', conversationId);
      } catch {
        // Non-blocking
      }

      // Synchronize with Communications Hub and other listening consoles in real time
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('comms_activity_update', {
            detail: {
              type: 'message_sent',
              channel: input.channel,
              recipient: email || phone,
              conversationId,
              messageId: deliveredMessageId,
              timestamp: new Date().toISOString(),
            },
          })
        );
        window.dispatchEvent(
          new CustomEvent('inbox_activity_sync', {
            detail: { conversationId, channel: input.channel },
          })
        );
      }

      if (!silent) toast.success(`Message sent via ${input.channel.toUpperCase()}`);
      return { saved: true, delivered: true, messageId: deliveredMessageId };
    } catch (err) {
      console.error('Failed to send message:', err);
      const reason = err instanceof Error ? err.message : 'Unknown error';
      notifyError(`Could not send the message: ${reason}`);
      return { saved: false, delivered: false, reason };
    } finally {
      if (!silent) setIsSending(false);
    }
  };


  /**
   * Fan a single composed message out to many recipients, one thread each, so
   * every reply still lands in its own unified-inbox conversation.
   */
  const sendBulk = async (
    recipients: BulkRecipient[],
    input: Omit<SendComposedInput, 'recipientUserId' | 'recipientName' | 'email' | 'phone'>,
  ): Promise<BulkProgress> => {
    const usable = recipients.filter((r) =>
      input.channel === 'email'
        ? !!r.email?.trim()
        : input.channel === 'in_app'
          ? !!r.user_id
          : !!r.phone?.trim(),
    );
    const skipped = recipients.length - usable.length;

    if (usable.length === 0) {
      toast.error(
        input.channel === 'email'
          ? 'None of the selected contacts have an email address'
          : input.channel === 'in_app'
            ? 'None of the selected contacts have a platform account'
            : 'None of the selected contacts have a phone number',
      );
      return { total: recipients.length, completed: 0, sent: 0, failed: recipients.length };
    }

    setIsSending(true);
    setBulkProgress({ total: usable.length, completed: 0, sent: 0, failed: 0 });

    let sent = 0;
    let failed = 0;
    const failures: { recipient: string; reason: string }[] = [];
    const batchId = `bulk-${Date.now()}`;

    // Sequential dispatch keeps us inside provider rate limits.
    for (const recipient of usable) {
      const label =
        recipient.full_name?.trim() || recipient.email?.trim() || recipient.phone?.trim() || 'Recipient';
      const outcome = await send(
        {
          ...input,
          recipientUserId: recipient.user_id || null,
          recipientName: (recipient.full_name || '').trim(),
          email: recipient.email?.trim() || '',
          phone: recipient.phone?.trim() || '',
        },
        { silent: true },
      );
      // Only a provider-accepted message counts as sent.
      if (outcome.delivered) {
        sent += 1;
      } else {
        failed += 1;
        failures.push({ recipient: label, reason: outcome.reason || 'Delivery failed' });
      }

      // Record in BulkMessageStatusTracker storage
      const contactVal =
        input.channel === 'email'
          ? recipient.email
          : input.channel === 'in_app'
            ? recipient.user_id
            : recipient.phone;

      const trackerEntry = {
        id: crypto.randomUUID(),
        batchId,
        userId: recipient.user_id || null,
        recipientName: label,
        contact: contactVal || 'Target',
        channel: input.channel,
        subject: input.subject,
        body: input.body,
        status: outcome.delivered ? 'delivered' : 'failed',
        error: outcome.delivered ? undefined : outcome.reason || 'Delivery failed',
        timestamp: new Date().toISOString(),
        attempts: 1,
      };

      try {
        const stored = localStorage.getItem('rentmaikar_bulk_tracker_items');
        const list = stored ? JSON.parse(stored) : [];
        list.unshift(trackerEntry);
        localStorage.setItem('rentmaikar_bulk_tracker_items', JSON.stringify(list.slice(0, 300)));
      } catch {
        /* storage unavailable */
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('comms_activity_update', {
            detail: {
              type: 'bulk_message_item',
              batchId,
              recipientName: label,
              recipient: contactVal,
              channel: input.channel,
              status: outcome.delivered ? 'delivered' : 'failed',
              error: outcome.delivered ? undefined : outcome.reason,
              timestamp: new Date().toISOString(),
            },
          })
        );
      }

      setBulkProgress({ total: usable.length, completed: sent + failed, sent, failed, failures });
    }

    setIsSending(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('comms_activity_update', {
          detail: {
            type: 'bulk_broadcast_complete',
            channel: input.channel,
            totalSent: sent,
            failed,
            timestamp: new Date().toISOString(),
          },
        })
      );
    }

    if (failed === 0) {
      toast.success(
        `Delivered to ${sent} recipient${sent === 1 ? '' : 's'} via ${input.channel.toUpperCase()}` +
          (skipped ? ` · ${skipped} skipped (missing contact)` : ''),
      );
    } else {
      toast.error(
        `Delivered ${sent}, failed ${failed}${skipped ? `, skipped ${skipped}` : ''}`,
        {
          description: failures
            .slice(0, 5)
            .map((f) => `${f.recipient}: ${f.reason}`)
            .join('\n') + (failures.length > 5 ? `\n+${failures.length - 5} more` : ''),
        },
      );
    }

    return { total: usable.length, completed: sent + failed, sent, failed, failures };

  };
  return { send, sendBulk, isSending, bulkProgress };

};
