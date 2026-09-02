import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Phone, Loader2, UserPlus, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { CallRegion, CallType } from '@/types/voip';

interface OutreachContact {
  id: string;
  full_name: string;
  raw_phone: string;
  phone_e164: string | null;
  country_code: string | null;
  status: string;
  region: string | null;
  source: string | null;
  notes: string | null;
  email?: string | null;
  signup_role?: string | null;
  last_contacted_at: string | null;
}


const STATUSES = [
  'prospect',
  'contacted',
  'invited',
  'signed_up',
  'onboarded',
  'unreachable',
  'opted_out',
] as const;

interface OutreachContactsPanelProps {
  onInitiateCall?: (
    callType: CallType,
    region: CallRegion,
    recipients: { phoneNumber: string; displayName?: string; userId?: string }[]
  ) => Promise<unknown>;
  isLoading?: boolean;
}

export const OutreachContactsPanel = ({ onInitiateCall, isLoading }: OutreachContactsPanelProps) => {
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let request = (supabase.from('outreach_contacts' as never) as any)
        .select('*')
        .eq('contact_type', 'driver')
        .order('full_name', { ascending: true })
        .limit(500);

      if (statusFilter !== 'all') request = request.eq('status', statusFilter);
      if (query.trim().length >= 2) {
        const q = query.trim();
        request = request.or(`full_name.ilike.%${q}%,raw_phone.ilike.%${q}%,phone_e164.ilike.%${q}%`);
      }

      const { data, error } = await request;
      if (error) throw error;
      setContacts((data || []) as OutreachContact[]);
    } catch (error) {
      console.error('Failed to load outreach contacts', error);
      toast({
        title: 'Could not load contacts',
        description: (error as Error)?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter, toast]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const grouped: Record<string, number> = {};
    contacts.forEach((c) => {
      grouped[c.status] = (grouped[c.status] || 0) + 1;
    });
    return grouped;
  }, [contacts]);

  const updateContact = async (contact: OutreachContact, patch: Partial<OutreachContact>) => {
    const { error } = await (supabase.from('outreach_contacts' as never) as any)
      .update(patch)
      .eq('id', contact.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, ...patch } : c)));
  };

  const handleCall = async (contact: OutreachContact) => {
    if (!contact.phone_e164) {
      toast({
        title: 'Phone number needs review',
        description: `${contact.full_name} has no valid international number on file.`,
        variant: 'destructive',
      });
      return;
    }
    if (!onInitiateCall) return;

    setBusyId(contact.id);
    try {
      const region: CallRegion = contact.phone_e164.startsWith('+234') ? 'Nigeria' : 'USA';
      await onInitiateCall('individual', region, [
        { phoneNumber: contact.phone_e164, displayName: contact.full_name },
      ]);
      await updateContact(contact, {
        status: contact.status === 'prospect' ? 'contacted' : contact.status,
        last_contacted_at: new Date().toISOString(),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleMessage = async (contact: OutreachContact) => {
    if (!contact.phone_e164) {
      toast({
        title: 'Phone number needs review',
        description: `${contact.full_name} has no valid international number on file.`,
        variant: 'destructive',
      });
      return;
    }
    setBusyId(contact.id);
    try {
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: {
          phone: contact.phone_e164,
          channel: 'sms',
          notificationType: 'general',
          name: contact.full_name,
          customMessage: `Hi ${contact.full_name.split(' ')[0]}, this is Rentmaikar. You can now sign up and complete driver onboarding at https://rentmaikar.com/auth to keep renting with us.`,
        },
      });
      if (error) throw error;
      toast({ title: 'Invite sent', description: `SMS sent to ${contact.phone_e164}` });
      await updateContact(contact, {
        status: 'invited',
        last_contacted_at: new Date().toISOString(),
      });
    } catch (error) {
      toast({
        title: 'Message failed',
        description: (error as Error)?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Driver Contacts (not yet registered)
        </CardTitle>
        <CardDescription>
          Imported driver contacts for outreach. No sign-in accounts exist for these people — they
          become platform users only after they sign up and complete onboarding themselves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{contacts.length} shown</Badge>
          {Object.entries(counts).map(([status, count]) => (
            <Badge key={status} variant="secondary" className="capitalize">
              {status.replace('_', ' ')}: {count}
            </Badge>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No contacts found.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signed up as</TableHead>
                  <TableHead className="text-right">Actions</TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">{contact.full_name}</TableCell>
                    <TableCell className="text-sm">
                      {contact.phone_e164 || (
                        <span className="text-destructive">{contact.raw_phone} (review)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {contact.region || '—'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={contact.status}
                        onValueChange={(value) => updateContact(contact, { status: value })}
                      >
                        <SelectTrigger className="h-8 w-[140px] capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s.replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {contact.signup_role ? (
                        <Badge variant="outline" className="capitalize">
                          {contact.signup_role === 'owner' ? 'Vehicle owner' : 'Driver'}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMessage(contact)}
                          disabled={!contact.phone_e164 || busyId === contact.id}
                        >
                          {busyId === contact.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                        </Button>
                        {onInitiateCall && (
                          <Button
                            size="sm"
                            onClick={() => handleCall(contact)}
                            disabled={!contact.phone_e164 || busyId === contact.id || isLoading}
                          >
                            <Phone className="h-4 w-4 mr-1" />
                            Call
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OutreachContactsPanel;
