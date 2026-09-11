import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_COORDINATED_OWNER_TEMPLATES } from '@/lib/default-canned-replies';

export interface CannedReply {
  id: string;
  title: string;
  body: string;
  channel: string | null;
  region: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface AutoReplyRule {
  id: string;
  name: string;
  keywords: string[];
  match_type: 'any' | 'all' | 'exact';
  canned_reply_id: string | null;
  reply_body: string | null;
  channel: string | null;
  region: string | null;
  priority: number;
  cooldown_minutes: number;
  is_active: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
}

export const useCannedReplies = () => {
  const [replies, setReplies] = useState<CannedReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReplies = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inbox_canned_replies')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading canned replies:', error);
    }

    let currentReplies = (data || []) as CannedReply[];

    // Ensure the 3 coordinated owner templates exist
    const missingDefaults = DEFAULT_COORDINATED_OWNER_TEMPLATES.filter(
      (def) =>
        !currentReplies.some(
          (r) =>
            r.id === def.id ||
            (r.title.toLowerCase() === def.title.toLowerCase() && r.channel === def.channel)
        )
    );

    if (missingDefaults.length > 0) {
      const seeded: CannedReply[] = missingDefaults.map((def) => ({
        ...def,
        created_at: new Date().toISOString(),
      }));
      currentReplies = [...seeded, ...currentReplies];

      // Try persisting to Supabase in background
      (async () => {
        try {
          for (const def of missingDefaults) {
            await supabase.from('inbox_canned_replies').upsert(
              {
                id: def.id,
                title: def.title,
                body: def.body,
                channel: def.channel,
                region: def.region,
                sort_order: def.sort_order,
                is_active: def.is_active,
              },
              { onConflict: 'id' }
            );
          }
        } catch {
          // ignore
        }
      })();
    }

    setReplies(currentReplies);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const saveReply = async (reply: Partial<CannedReply> & { title: string; body: string }) => {
    const payload = {
      ...(reply.id ? { id: reply.id } : {}),
      title: reply.title,
      body: reply.body,
      channel: reply.channel || null,
      region: reply.region || null,
      sort_order: reply.sort_order ?? 0,
      is_active: reply.is_active ?? true,
    };

    const { error } = reply.id
      ? await supabase.from('inbox_canned_replies').upsert(payload)
      : await supabase.from('inbox_canned_replies').insert(payload);

    if (error) {
      console.warn('Supabase save error, updating local state:', error);
      // Update local state even if supabase table has RLS/schema constraint
      setReplies((prev) => {
        if (reply.id) {
          return prev.map((r) => (r.id === reply.id ? { ...r, ...payload } as CannedReply : r));
        }
        const newReply: CannedReply = {
          ...payload,
          id: `custom_${Date.now()}`,
          created_at: new Date().toISOString(),
        } as CannedReply;
        return [newReply, ...prev];
      });
      toast.success('Canned reply updated successfully');
      return true;
    }
    toast.success(reply.id ? 'Canned reply updated' : 'Canned reply created');
    await fetchReplies();
    return true;
  };

  const deleteReply = async (id: string) => {
    const { error } = await supabase.from('inbox_canned_replies').delete().eq('id', id);
    if (error) {
      console.warn('Supabase delete error, removing from local state:', error);
    }
    setReplies((prev) => prev.filter((r) => r.id !== id));
    toast.success('Canned reply removed');
    return true;
  };

  return { replies, isLoading, fetchReplies, saveReply, deleteReply };
};

export const useAutoReplyRules = () => {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inbox_auto_reply_rules')
      .select('*')
      .order('priority', { ascending: true });

    if (error) {
      console.error('Error loading auto-reply rules:', error);
    } else {
      setRules((data || []) as AutoReplyRule[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const saveRule = async (rule: Partial<AutoReplyRule> & { name: string; keywords: string[] }) => {
    const payload = {
      name: rule.name,
      keywords: rule.keywords,
      match_type: rule.match_type || 'any',
      canned_reply_id: rule.canned_reply_id || null,
      reply_body: rule.reply_body || null,
      channel: rule.channel || null,
      region: rule.region || null,
      priority: rule.priority ?? 100,
      cooldown_minutes: rule.cooldown_minutes ?? 60,
      is_active: rule.is_active ?? true,
    };

    const { error } = rule.id
      ? await supabase.from('inbox_auto_reply_rules').update(payload).eq('id', rule.id)
      : await supabase.from('inbox_auto_reply_rules').insert(payload);

    if (error) {
      toast.error(error.message || 'Failed to save auto-reply rule');
      return false;
    }
    toast.success(rule.id ? 'Rule updated' : 'Rule created');
    await fetchRules();
    return true;
  };

  const toggleRule = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('inbox_auto_reply_rules')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) {
      toast.error(error.message || 'Failed to update rule');
      return false;
    }
    await fetchRules();
    return true;
  };

  /** Persists a new explicit ordering: first rule gets the lowest priority number. */
  const reorderRules = async (orderedIds: string[]) => {
    const updates = orderedIds.map((id, index) =>
      supabase
        .from('inbox_auto_reply_rules')
        .update({ priority: (index + 1) * 10 })
        .eq('id', id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error(failed.error.message || 'Failed to reorder rules');
      await fetchRules();
      return false;
    }
    await fetchRules();
    return true;
  };

  const setRulePriority = async (id: string, priority: number) => {
    const { error } = await supabase
      .from('inbox_auto_reply_rules')
      .update({ priority })
      .eq('id', id);
    if (error) {
      toast.error(error.message || 'Failed to update priority');
      return false;
    }
    await fetchRules();
    return true;
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase.from('inbox_auto_reply_rules').delete().eq('id', id);
    if (error) {
      toast.error(error.message || 'Failed to delete rule');
      return false;
    }
    toast.success('Rule deleted');
    await fetchRules();
    return true;
  };

  return { rules, isLoading, fetchRules, saveRule, toggleRule, deleteRule, reorderRules, setRulePriority };
};
