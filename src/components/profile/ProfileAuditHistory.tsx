import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface AuditEntry {
  id: string;
  field: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  source: string | null;
  created_at: string;
  subject_name: string | null;
  actor_name: string | null;
}


const FIELD_LABEL: Record<string, string> = {
  full_name: 'Name',
  phone: 'Phone',
  email: 'Email',
  avatar_url: 'Passport picture',
  identity_verification_status: 'Verification status',
};

const ACTION_LABEL: Record<string, string> = {
  updated: 'updated',
  uploaded: 'uploaded',
  replaced: 'replaced',
  removed: 'removed',
};

const mask = (field: string, value: string | null) => {
  if (!value) return '—';
  if (field === 'avatar_url') return 'photo';
  if (field === 'email') {
    const [u, d] = value.split('@');
    return d ? `${u.slice(0, 2)}•••@${d}` : value;
  }
  if (field === 'phone') return value.replace(/\d(?=\d{4})/g, '•');
  return value;
};

export function ProfileAuditHistory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profile_settings_audit')
        .select('id, field, action, old_value, new_value, source, created_at, subject_name, actor_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25);
      if (!cancelled) setEntries((data as AuditEntry[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Change history</CardTitle>
      </CardHeader>
      <CardContent>
        {entries === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="py-2.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">
                  {FIELD_LABEL[e.field] ?? e.field}
                </span>
                <span className="text-muted-foreground">
                  {ACTION_LABEL[e.action] ?? e.action}
                </span>
                {e.field !== 'avatar_url' &&
                  e.field !== 'identity_verification_status' && (
                    <span className="text-xs text-muted-foreground">
                      {mask(e.field, e.old_value)} → {mask(e.field, e.new_value)}
                    </span>
                  )}
                {e.field === 'identity_verification_status' && (
                  <span className="text-xs text-muted-foreground">
                    {e.old_value ?? '—'} → {e.new_value ?? '—'}
                  </span>
                )}
                {e.source && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {e.source}
                  </Badge>
                )}
                {e.actor_name && e.actor_name !== e.subject_name && (
                  <span className="text-[11px] text-muted-foreground italic">
                    by {e.actor_name}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </span>

              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default ProfileAuditHistory;
