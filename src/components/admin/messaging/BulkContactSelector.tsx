import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  Search,
  CheckSquare,
  Square,
  UserCheck,
  Filter,
  X,
  Plus,
  Loader2,
  AlertTriangle,
  Mail,
  Phone,
  MessageSquare,
  Layers,
  Sparkles,
  FileSpreadsheet,
  Check,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { UserContact, MessagingChannel } from './types';

interface BulkContactSelectorProps {
  channel: MessagingChannel;
  selectedRecipients: UserContact[];
  onSelectedChange: (recipients: UserContact[]) => void;
}

export const BulkContactSelector = ({
  channel,
  selectedRecipients,
  onSelectedChange,
}: BulkContactSelectorProps) => {
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelReadinessFilter, setChannelReadinessFilter] = useState<'all' | 'ready'>('all');

  // Manual Batch Paste Dialog state
  const [isPasteDialogOpen, setIsPasteDialogOpen] = useState(false);
  const [pasteInput, setPasteInput] = useState('');

  // Fetch all registered contacts from profiles and user_roles
  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, full_name, email, phone, is_active, country')
          .order('full_name', { ascending: true })
          .limit(1500),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      if (pErr) throw pErr;
      if (rErr) throw rErr;

      const roleMap = new Map<string, string>();
      (roles || []).forEach((r) => {
        // Normalize role display
        const rawRole = r.role?.toLowerCase() || 'user';
        const mappedRole =
          rawRole === 'vehicle_owner' || rawRole === 'owner'
            ? 'owner'
            : rawRole === 'driver'
            ? 'driver'
            : rawRole === 'admin' || rawRole === 'staff' || rawRole === 'manager'
            ? 'admin'
            : rawRole === 'applicant'
            ? 'applicant'
            : rawRole;
        roleMap.set(r.user_id, mappedRole);
      });

      const loadedContacts: UserContact[] = (profiles || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name || 'Unnamed User',
        email: p.email || null,
        phone: p.phone || null,
        role: roleMap.get(p.user_id) || 'user',
        is_active: p.is_active ?? true,
        country: p.country || null,
      }));

      setContacts(loadedContacts);
    } catch (err) {
      console.error('Error fetching bulk contacts:', err);
      toast.error('Failed to load contacts list');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  // Filtered contacts list
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      // Role Filter
      if (roleFilter !== 'all') {
        if (roleFilter === 'driver' && contact.role !== 'driver') return false;
        if (roleFilter === 'owner' && contact.role !== 'owner') return false;
        if (roleFilter === 'admin' && contact.role !== 'admin') return false;
        if (roleFilter === 'applicant' && contact.role !== 'applicant') return false;
      }

      // Status Filter
      if (statusFilter === 'active' && contact.is_active === false) return false;
      if (statusFilter === 'inactive' && contact.is_active !== false) return false;

      // Channel Readiness Filter
      if (channelReadinessFilter === 'ready') {
        if (channel === 'email' && (!contact.email || !contact.email.includes('@'))) return false;
        if ((channel === 'sms' || channel === 'whatsapp') && (!contact.phone || contact.phone.length < 6))
          return false;
      }

      // Country / Phone prefix filter
      if (countryFilter !== 'all') {
        if (countryFilter === 'ng' && !contact.phone?.startsWith('+234') && contact.country !== 'NG')
          return false;
        if (countryFilter === 'us' && !contact.phone?.startsWith('+1') && contact.country !== 'US')
          return false;
        if (countryFilter === 'uk' && !contact.phone?.startsWith('+44') && contact.country !== 'GB')
          return false;
        if (countryFilter === 'gh' && !contact.phone?.startsWith('+233') && contact.country !== 'GH')
          return false;
        if (countryFilter === 'ke' && !contact.phone?.startsWith('+254') && contact.country !== 'KE')
          return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = contact.full_name?.toLowerCase().includes(query);
        const matchEmail = contact.email?.toLowerCase().includes(query);
        const matchPhone = contact.phone?.toLowerCase().includes(query);
        const matchRole = contact.role.toLowerCase().includes(query);
        if (!matchName && !matchEmail && !matchPhone && !matchRole) return false;
      }

      return true;
    });
  }, [contacts, roleFilter, statusFilter, channelReadinessFilter, countryFilter, searchQuery, channel]);

  // Selected state mappings
  const selectedMap = useMemo(() => {
    const map = new Map<string, UserContact>();
    selectedRecipients.forEach((r) => map.set(r.user_id, r));
    return map;
  }, [selectedRecipients]);

  const toggleSelectContact = (contact: UserContact) => {
    if (selectedMap.has(contact.user_id)) {
      onSelectedChange(selectedRecipients.filter((r) => r.user_id !== contact.user_id));
    } else {
      onSelectedChange([...selectedRecipients, contact]);
    }
  };

  const handleSelectAllFiltered = () => {
    const newItems = [...selectedRecipients];
    filteredContacts.forEach((fc) => {
      if (!selectedMap.has(fc.user_id)) {
        newItems.push(fc);
      }
    });
    onSelectedChange(newItems);
    toast.success(`Selected all ${filteredContacts.length} filtered contacts`);
  };

  const handleDeselectAllFiltered = () => {
    const filteredIds = new Set(filteredContacts.map((c) => c.user_id));
    const newItems = selectedRecipients.filter((r) => !filteredIds.has(r.user_id));
    onSelectedChange(newItems);
    toast.info('Deselected filtered contacts');
  };

  const handleClearAll = () => {
    onSelectedChange([]);
    toast.info('Cleared all selected recipients');
  };

  // Quick segment selections
  const handleSelectSegment = (role: string) => {
    const targetContacts = contacts.filter((c) => c.role === role);
    const existingIds = new Set(selectedRecipients.map((r) => r.user_id));
    const toAdd = targetContacts.filter((c) => !existingIds.has(c.user_id));
    onSelectedChange([...selectedRecipients, ...toAdd]);
    toast.success(`Added ${toAdd.length} ${role.toUpperCase()} contacts to broadcast list`);
  };

  // Channel Compatibility stats
  const compatibilityStats = useMemo(() => {
    let compatibleCount = 0;
    let missingFieldCount = 0;

    selectedRecipients.forEach((r) => {
      if (channel === 'email') {
        if (r.email && r.email.includes('@')) compatibleCount++;
        else missingFieldCount++;
      } else {
        if (r.phone && r.phone.length >= 7) compatibleCount++;
        else missingFieldCount++;
      }
    });

    return { compatibleCount, missingFieldCount };
  }, [selectedRecipients, channel]);

  // Remove incompatible contacts for the active channel
  const handleRemoveIncompatible = () => {
    const valid = selectedRecipients.filter((r) => {
      if (channel === 'email') return r.email && r.email.includes('@');
      return r.phone && r.phone.length >= 7;
    });
    const removedCount = selectedRecipients.length - valid.length;
    onSelectedChange(valid);
    toast.success(`Removed ${removedCount} incompatible contact${removedCount === 1 ? '' : 's'}`);
  };

  // Process manual CSV / newline paste
  const handleProcessPaste = () => {
    if (!pasteInput.trim()) return;
    const lines = pasteInput.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const added: UserContact[] = [];

    lines.forEach((item, index) => {
      if (item.includes('@')) {
        // Email
        const existing = contacts.find((c) => c.email?.toLowerCase() === item.toLowerCase());
        if (existing) {
          added.push(existing);
        } else {
          added.push({
            user_id: `custom_email_${Date.now()}_${index}`,
            full_name: item.split('@')[0],
            email: item,
            phone: null,
            role: 'custom',
          });
        }
      } else if (item.replace(/\D/g, '').length >= 7) {
        // Phone
        const cleanPhone = item.startsWith('+') ? item : `+${item.replace(/\D/g, '')}`;
        const existing = contacts.find((c) => c.phone?.replace(/\D/g, '') === cleanPhone.replace(/\D/g, ''));
        if (existing) {
          added.push(existing);
        } else {
          added.push({
            user_id: `custom_phone_${Date.now()}_${index}`,
            full_name: `Contact ${cleanPhone}`,
            email: null,
            phone: cleanPhone,
            role: 'custom',
          });
        }
      }
    });

    // Merge with existing avoiding duplicate IDs
    const existingIds = new Set(selectedRecipients.map((r) => r.user_id));
    const toAdd = added.filter((c) => !existingIds.has(c.user_id));
    onSelectedChange([...selectedRecipients, ...toAdd]);
    setPasteInput('');
    setIsPasteDialogOpen(false);
    toast.success(`Added ${toAdd.length} recipient${toAdd.length === 1 ? '' : 's'} from paste`);
  };

  return (
    <div className="space-y-4">
      {/* Quick Segment Shortcut Chips */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/20">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-muted-foreground flex items-center gap-1 mr-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Quick Segments:
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 gap-1 bg-background"
            onClick={() => handleSelectSegment('driver')}
          >
            🚗 All Drivers ({contacts.filter((c) => c.role === 'driver').length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 gap-1 bg-background"
            onClick={() => handleSelectSegment('owner')}
          >
            🔑 Vehicle Owners ({contacts.filter((c) => c.role === 'owner').length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 gap-1 bg-background"
            onClick={() => handleSelectSegment('admin')}
          >
            🛡️ Staff & Admins ({contacts.filter((c) => c.role === 'admin').length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 gap-1 bg-background"
            onClick={() => handleSelectSegment('applicant')}
          >
            📋 Applicants ({contacts.filter((c) => c.role === 'applicant').length})
          </Button>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2.5 gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
          onClick={() => setIsPasteDialogOpen(true)}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Paste List / CSV
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search contacts by name, email, phone, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="driver">Drivers</SelectItem>
            <SelectItem value="owner">Vehicle Owners</SelectItem>
            <SelectItem value="applicant">Applicants</SelectItem>
            <SelectItem value="admin">Admins & Staff</SelectItem>
          </SelectContent>
        </Select>

        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Country/Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            <SelectItem value="us">🇺🇸 USA & Canada (+1)</SelectItem>
            <SelectItem value="ng">🇳🇬 Nigeria (+234)</SelectItem>
            <SelectItem value="uk">🇬🇧 United Kingdom (+44)</SelectItem>
            <SelectItem value="gh">🇬🇭 Ghana (+233)</SelectItem>
            <SelectItem value="ke">🇰🇪 Kenya (+254)</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={channelReadinessFilter}
          onValueChange={(v) => setChannelReadinessFilter(v as any)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Readiness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contacts</SelectItem>
            <SelectItem value="ready">
              {channel === 'email' ? '✉️ Has Valid Email' : '📱 Has Phone Number'}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Selection Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">
            {filteredContacts.length} contacts matching filters
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-primary font-medium">
            {selectedRecipients.length} selected for broadcast
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2 gap-1"
            onClick={handleSelectAllFiltered}
            disabled={filteredContacts.length === 0}
          >
            <CheckSquare className="h-3 w-3" />
            Select All Filtered ({filteredContacts.length})
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
            onClick={handleDeselectAllFiltered}
            disabled={filteredContacts.length === 0}
          >
            <Square className="h-3 w-3" />
            Deselect Filtered
          </Button>

          {selectedRecipients.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10"
              onClick={handleClearAll}
            >
              Clear All ({selectedRecipients.length})
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={fetchContacts}
            title="Refresh database contacts"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Selected Recipients Chip Carousel / Summary */}
      {selectedRecipients.length > 0 && (
        <div className="rounded-lg border bg-primary/5 p-3 space-y-2 border-primary/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge className="h-5 px-2 text-xs font-semibold">
                {selectedRecipients.length} Recipient{selectedRecipients.length === 1 ? '' : 's'} Selected
              </Badge>

              {compatibilityStats.missingFieldCount > 0 ? (
                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>
                    {compatibilityStats.missingFieldCount} missing {channel === 'email' ? 'email' : 'phone'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="link"
                    className="h-auto p-0 text-xs text-amber-700 dark:text-amber-300 underline font-semibold ml-1"
                    onClick={handleRemoveIncompatible}
                  >
                    Exclude them
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>All ready for {channel.toUpperCase()} dispatch</span>
                </div>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-24">
            <div className="flex flex-wrap gap-1.5">
              {selectedRecipients.map((recipient) => {
                const isReady =
                  channel === 'email'
                    ? !!(recipient.email && recipient.email.includes('@'))
                    : !!(recipient.phone && recipient.phone.length >= 7);

                return (
                  <Badge
                    key={recipient.user_id}
                    variant={isReady ? 'secondary' : 'destructive'}
                    className="gap-1.5 pl-2 pr-1 py-0.5 text-[11px] font-normal"
                  >
                    <span className="font-medium max-w-[120px] truncate">{recipient.full_name}</span>
                    <span className="opacity-70 text-[10px]">({recipient.role})</span>
                    <button
                      type="button"
                      onClick={() => toggleSelectContact(recipient)}
                      className="rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Contacts List / Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <ScrollArea className="h-72">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Loading database contacts...</span>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No contacts match the active filters</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try clearing search terms or selecting 'All Roles'.
              </p>
            </div>
          ) : (
            <div className="divide-y text-xs">
              {filteredContacts.map((contact) => {
                const isSelected = selectedMap.has(contact.user_id);
                const hasEmail = !!(contact.email && contact.email.includes('@'));
                const hasPhone = !!(contact.phone && contact.phone.length >= 7);

                return (
                  <div
                    key={contact.user_id}
                    className={`flex items-center justify-between p-2.5 transition-colors hover:bg-muted/50 cursor-pointer ${
                      isSelected ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => toggleSelectContact(contact)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectContact(contact)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${contact.full_name}`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground truncate">
                            {contact.full_name}
                          </span>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono px-1 py-0">
                            {contact.role}
                          </Badge>
                          {contact.is_active === false && (
                            <Badge variant="secondary" className="text-[10px] text-muted-foreground px-1 py-0">
                              Inactive
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                          <span className={`flex items-center gap-1 ${hasEmail ? '' : 'text-amber-500/80'}`}>
                            <Mail className="h-3 w-3" />
                            {contact.email || 'No email'}
                          </span>
                          <span className={`flex items-center gap-1 ${hasPhone ? '' : 'text-amber-500/80'}`}>
                            <Phone className="h-3 w-3" />
                            {contact.phone || 'No phone'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pl-2">
                      {channel === 'email' ? (
                        hasEmail ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                            Email Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                            No Email
                          </Badge>
                        )
                      ) : hasPhone ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                          Phone Ready
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                          No Phone
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Manual Paste Modal */}
      <Dialog open={isPasteDialogOpen} onOpenChange={setIsPasteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Paste Recipient List / CSV
            </DialogTitle>
            <DialogDescription className="text-xs">
              Paste email addresses or phone numbers separated by newlines, commas, or semicolons.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Textarea
              placeholder={`john@example.com\n+16083843932\nsarah@company.com\n+2348012345678`}
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              className="min-h-[140px] font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Existing database contacts will automatically be matched and linked with their user profiles.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPasteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleProcessPaste} disabled={!pasteInput.trim()}>
              Add to Broadcast List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
