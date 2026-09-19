import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Phone,
  Loader2,
  UserPlus,
  MessageSquare,
  Send,
  Sparkles,
  CheckSquare,
  Square,
  Check,
  ExternalLink,
} from 'lucide-react';
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

  // Bulk messaging and selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkChannel, setBulkChannel] = useState<'sms' | 'whatsapp' | 'email'>('sms');
  const [bulkTemplateKey, setBulkTemplateKey] = useState<string>('driver_invite');
  const [bulkMessageText, setBulkMessageText] = useState<string>(
    'Hi {{first_name}}, this is Rentmaikar. You can now complete your driver onboarding at https://rentmaikar.com/auth to keep renting with us.'
  );
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ sent: number; total: number; failed: number }>({
    sent: 0,
    total: 0,
    failed: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query.trim();
      const normalizedQ = q.toLowerCase();
      const isDriverContactsAll = [
        'driver contacts',
        'driver contact',
        'driver_contacts',
        'driver-contacts',
        'driver contacts list',
        'all driver contacts',
        'all drivers',
        'drivers',
      ].some((k) => normalizedQ === k || normalizedQ.includes('driver contact'));

      const is2026Batch = [
        'driver_contacts_update_2026',
        '#drivers-2026',
        'drivers-2026',
        'drivers_2026',
        '2026 driver',
      ].some((k) => normalizedQ.includes(k));

      let request = (supabase.from('outreach_contacts' as never) as any)
        .select('*')
        .eq('contact_type', 'driver')
        .order('full_name', { ascending: true })
        .limit(2000);

      if (statusFilter !== 'all') request = request.eq('status', statusFilter);

      if (isDriverContactsAll) {
        // Return all 600+ driver contacts without name restriction
      } else if (is2026Batch) {
        request = request.or(
          'source.eq.driver_contacts_update_2026,notes.ilike.%#drivers%,notes.ilike.%driver_contacts_update_2026%'
        );
      } else if (q.length >= 2) {
        request = request.or(
          `full_name.ilike.%${q}%,raw_phone.ilike.%${q}%,phone_e164.ilike.%${q}%,email.ilike.%${q}%,source.ilike.%${q}%,notes.ilike.%${q}%`
        );
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

  // Selection handlers
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length && contacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const selectAllDriverContacts = () => {
    setQuery('DRIVER CONTACTS');
    setSelectedIds(new Set(contacts.map((c) => c.id)));
    toast({
      title: 'DRIVER CONTACTS selected',
      description: `Loaded and selected all ${contacts.length} driver contacts`,
    });
  };

  const selectEntire2026Roster = () => {
    setQuery('driver_contacts_update_2026');
    const rosterContacts = contacts.filter(
      (c) =>
        c.source === 'driver_contacts_update_2026' ||
        c.notes?.includes('#drivers') ||
        c.notes?.includes('driver_contacts_update_2026')
    );
    if (rosterContacts.length > 0) {
      setSelectedIds(new Set(rosterContacts.map((c) => c.id)));
      toast({
        title: '2026 Driver Roster selected',
        description: `Selected ${rosterContacts.length} drivers for bulk messaging`,
      });
    }
  };

  // Template switch handler
  const handleTemplateChange = (val: string) => {
    setBulkTemplateKey(val);
    if (val === 'driver_invite') {
      setBulkMessageText(
        'Hi {{first_name}}, this is Rentmaikar. You can now complete your driver onboarding at https://rentmaikar.com/auth to keep renting with us.'
      );
    } else if (val === 'roster_welcome') {
      setBulkMessageText(
        'Hello {{first_name}}! Welcome to the Rentmaikar Driver Network. Please verify your phone number and complete your driver profile at https://rentmaikar.com/auth to receive vehicle dispatches.'
      );
    } else if (val === 'urgent_dispatch') {
      setBulkMessageText(
        'Rentmaikar Notice: High demand for drivers in your region today! Log in to https://rentmaikar.com/auth to claim active vehicle rentals.'
      );
    }
  };

  // Bulk dispatch execution
  const handleSendBulkMessages = async () => {
    const targetContacts = contacts.filter((c) => selectedIds.has(c.id));
    if (targetContacts.length === 0) {
      toast({ title: 'No recipients selected', variant: 'destructive' });
      return;
    }

    setIsSendingBulk(true);
    setBulkProgress({ sent: 0, total: targetContacts.length, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetContacts.length; i++) {
      const contact = targetContacts[i];
      const firstName = contact.full_name.split(' ')[0] || 'Driver';
      const personalizedMessage = bulkMessageText
        .replace(/\{\{first_name\}\}/gi, firstName)
        .replace(/\{\{full_name\}\}/gi, contact.full_name);

      try {
        if (bulkChannel === 'sms' || bulkChannel === 'whatsapp') {
          if (!contact.phone_e164) {
            failCount++;
            continue;
          }
          const { error } = await supabase.functions.invoke('send-sms-notification', {
            body: {
              phone: contact.phone_e164,
              channel: bulkChannel,
              notificationType: 'general',
              name: contact.full_name,
              customMessage: personalizedMessage,
            },
          });
          if (error) throw error;
        } else {
          // Email channel
          if (!contact.email) {
            failCount++;
            continue;
          }
          const { error } = await supabase.functions.invoke('send-email-notification', {
            body: {
              to: contact.email,
              name: contact.full_name,
              subject: 'Rentmaikar Driver Onboarding & Network Invitation',
              body: personalizedMessage,
            },
          });
          if (error) throw error;
        }

        // Record successful dispatch
        await (supabase.from('outreach_contacts' as never) as any)
          .update({
            status: 'invited',
            last_contacted_at: new Date().toISOString(),
          })
          .eq('id', contact.id);

        successCount++;
      } catch (err) {
        console.error(`Failed to send to ${contact.full_name}:`, err);
        failCount++;
      }

      setBulkProgress({ sent: successCount, total: targetContacts.length, failed: failCount });
    }

    setIsSendingBulk(false);
    setIsBulkDialogOpen(false);
    toast({
      title: 'Bulk Messaging Complete',
      description: `Dispatched messages to ${successCount} contacts (${failCount} failed/missing numbers).`,
    });
    load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Driver Contacts (not yet registered)
            </CardTitle>
            <CardDescription>
              Imported driver contacts for outreach. No sign-in accounts exist for these people — they
              become platform users only after they sign up and complete onboarding themselves.
            </CardDescription>
          </div>

          {/* Bulk Action Bar */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant={selectedIds.size > 0 ? 'default' : 'outline'}
              className="gap-1.5 h-8 text-xs font-semibold"
              disabled={selectedIds.size === 0}
              onClick={() => setIsBulkDialogOpen(true)}
            >
              <Send className="h-3.5 w-3.5" />
              Bulk Message ({selectedIds.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search, Filter, and Quick Search Shortcuts */}
        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or 'DRIVER CONTACTS'..."
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

          {/* Quick Search Shortcut Chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Search Value:
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-mono text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors shadow-sm"
              onClick={selectAllDriverContacts}
              title="Click to call up and select all 600+ Driver Contacts"
            >
              📋 DRIVER CONTACTS (600+ Drivers)
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-mono text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              onClick={selectEntire2026Roster}
              title="Click to call up 2026 Driver Roster (35)"
            >
              2026 Roster (35)
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-muted bg-muted/40 font-mono text-xs hover:bg-muted transition-colors"
              onClick={() => setQuery('#drivers-2026')}
            >
              #drivers-2026
            </button>

            {selectedIds.size > 0 && (
              <Badge variant="default" className="ml-auto text-xs px-2">
                {selectedIds.size} selected for bulk action
              </Badge>
            )}
          </div>
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={contacts.length > 0 && selectedIds.size === contacts.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all contacts"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signed up as</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => {
                  const isSelected = selectedIds.has(contact.id);
                  return (
                    <TableRow key={contact.id} className={isSelected ? 'bg-primary/5' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectOne(contact.id)}
                          aria-label={`Select ${contact.full_name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{contact.full_name}</div>
                        {contact.email && (
                          <div className="text-xs text-muted-foreground font-normal">{contact.email}</div>
                        )}
                        {contact.source === 'driver_contacts_update_2026' && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-400/50 mt-0.5">
                            2026 Roster
                          </Badge>
                        )}
                      </TableCell>
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
                            title="Send SMS Invite"
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
                              title="Dial Driver"
                            >
                              <Phone className="h-4 w-4 mr-1" />
                              Call
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Bulk Outreach Message Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Bulk Messaging to Outreach Drivers
            </DialogTitle>
            <DialogDescription>
              Dispatch an onboarding invite or announcement to the {selectedIds.size} selected driver contact{selectedIds.size === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Channel Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Delivery Channel</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={bulkChannel === 'sms' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setBulkChannel('sms')}
                >
                  📱 SMS
                </Button>
                <Button
                  type="button"
                  variant={bulkChannel === 'whatsapp' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setBulkChannel('whatsapp')}
                >
                  💬 WhatsApp
                </Button>
                <Button
                  type="button"
                  variant={bulkChannel === 'email' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setBulkChannel('email')}
                >
                  ✉️ Email
                </Button>
              </div>
            </div>

            {/* Quick Template Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Message Template</Label>
              <Select value={bulkTemplateKey} onValueChange={handleTemplateChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver_invite">Driver Onboarding & Sign Up Invite</SelectItem>
                  <SelectItem value="roster_welcome">2026 Driver Roster Welcome</SelectItem>
                  <SelectItem value="urgent_dispatch">High Demand Rental Dispatch Alert</SelectItem>
                  <SelectItem value="custom">Custom Message</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Message Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Message Content</Label>
                <span className="text-[11px] text-muted-foreground">
                  Supports: <code className="bg-muted px-1 rounded">{'{{first_name}}'}</code>, <code className="bg-muted px-1 rounded">{'{{full_name}}'}</code>
                </span>
              </div>
              <Textarea
                rows={4}
                value={bulkMessageText}
                onChange={(e) => setBulkMessageText(e.target.value)}
                className="text-xs resize-none"
                placeholder="Type your broadcast message..."
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{bulkMessageText.length} characters</span>
                {bulkChannel === 'sms' && (
                  <span>~{Math.ceil(bulkMessageText.length / 160) || 1} SMS segment(s)</span>
                )}
              </div>
            </div>

            {/* Progress indicator during dispatch */}
            {isSendingBulk && (
              <div className="p-3 rounded-lg border bg-muted/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Sending broadcast...
                  </span>
                  <span>
                    {bulkProgress.sent} of {bulkProgress.total} sent ({bulkProgress.failed} failed)
                  </span>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{
                      width: `${(bulkProgress.sent / (bulkProgress.total || 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBulkDialogOpen(false)}
              disabled={isSendingBulk}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSendBulkMessages}
              disabled={isSendingBulk || !bulkMessageText.trim() || selectedIds.size === 0}
              className="gap-1.5 font-semibold"
            >
              {isSendingBulk ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send to {selectedIds.size} Contact{selectedIds.size === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default OutreachContactsPanel;
