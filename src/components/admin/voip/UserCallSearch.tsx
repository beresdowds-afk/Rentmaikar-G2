import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Phone, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { CallRegion, CallType } from '@/types/voip';

interface UserResult {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
}

interface UserCallSearchProps {
  onInitiateCall: (
    callType: CallType,
    region: CallRegion,
    recipients: { phoneNumber: string; displayName?: string; userId?: string }[]
  ) => Promise<any>;
  isLoading: boolean;
  /** Render without the surrounding Card (when merged into the dialer). */
  embedded?: boolean;
  /** Fired right before the call is initiated so the dialer can prefill fields. */
  onUserSelected?: (user: UserResult) => void;
}

export const UserCallSearch = ({ onInitiateCall, isLoading, embedded = false, onUserSelected }: UserCallSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [callingUserId, setCallingUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (searchQuery.length < 2) {
      setUsers([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const cleanQuery = searchQuery.trim().replace(/[%,]/g, '');
        const normalizedQ = cleanQuery.toLowerCase();
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

        const isBatchSearch = [
          'driver_contacts_update_2026',
          '#drivers-2026',
          'drivers-2026',
          'drivers_2026',
          '2026 driver',
        ].some((k) => normalizedQ.includes(k));

        if (isDriverContactsAll) {
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

          const outreachResults: UserResult[] = ((outreachRes.data || []) as any[]).map((o) => ({
            user_id: o.id,
            full_name: o.full_name || 'Driver Contact',
            email: o.email || null,
            phone: o.phone_e164 || o.raw_phone || null,
            role: 'driver',
          }));

          const profileResults: UserResult[] = ((profilesRes.data || []) as any[])
            .map((r: any) => r.profiles)
            .filter(Boolean)
            .map((p: any) => ({
              user_id: p.user_id,
              full_name: p.full_name || 'Registered Driver',
              email: p.email || null,
              phone: p.phone || null,
              role: 'driver',
            }));

          const seen = new Set<string>();
          const combined: UserResult[] = [];
          for (const item of [...outreachResults, ...profileResults]) {
            const key = item.phone || item.email?.toLowerCase() || item.user_id;
            if (key && !seen.has(key)) {
              seen.add(key);
              combined.push(item);
            }
          }
          setUsers(combined);
        } else if (isBatchSearch) {
          const { data: outreach, error: oErr } = await (supabase.from('outreach_contacts' as never) as any)
            .select('id, full_name, email, phone_e164, raw_phone, source')
            .or('source.eq.driver_contacts_update_2026,notes.ilike.%#drivers%')
            .order('full_name', { ascending: true })
            .limit(100);

          if (oErr) throw oErr;
          const outreachResults: UserResult[] = (outreach || []).map((o: any) => ({
            user_id: o.id,
            full_name: o.full_name || 'Driver Contact',
            email: o.email || null,
            phone: o.phone_e164 || o.raw_phone || null,
            role: 'driver',
          }));
          setUsers(outreachResults);
        } else {
          // Search profiles and outreach_contacts in parallel
          const [{ data: profiles, error: profileError }, { data: outreach, error: outreachError }] = await Promise.all([
            supabase
              .from('profiles')
              .select('user_id, full_name, email, phone')
              .or(`full_name.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%`)
              .limit(20),
            (supabase.from('outreach_contacts' as never) as any)
              .select('id, full_name, email, phone_e164, raw_phone, source')
              .or(`full_name.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%,phone_e164.ilike.%${cleanQuery}%,raw_phone.ilike.%${cleanQuery}%`)
              .limit(20),
          ]);

          if (profileError) throw profileError;

          // Get roles for profiles
          const userIds = (profiles || []).map(p => p.user_id);
          let roleMap = new Map<string, string>();
          if (userIds.length > 0) {
            const { data: roles } = await supabase
              .from('user_roles')
              .select('user_id, role')
              .in('user_id', userIds);
            roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
          }

          const profileResults: UserResult[] = (profiles || []).map(p => ({
            user_id: p.user_id,
            full_name: p.full_name,
            email: p.email,
            phone: p.phone,
            role: roleMap.get(p.user_id) || 'user',
          }));

          const outreachResults: UserResult[] = (outreach || []).map((o: any) => ({
            user_id: o.id,
            full_name: o.full_name || 'Driver Contact',
            email: o.email || null,
            phone: o.phone_e164 || o.raw_phone || null,
            role: 'driver',
          }));

          // Deduplicate
          const seen = new Set<string>();
          const combined: UserResult[] = [];
          for (const item of [...profileResults, ...outreachResults]) {
            const key = item.phone || item.email || item.user_id;
            if (key && !seen.has(key)) {
              seen.add(key);
              combined.push(item);
            }
          }

          // Filter by role
          const filtered = roleFilter === 'all'
            ? combined.filter(u => ['driver', 'owner'].includes(u.role))
            : combined.filter(u => u.role === roleFilter);

          setUsers(filtered);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, roleFilter]);

  const handleCallUser = async (user: UserResult) => {
    if (!user.phone) {
      toast({
        title: 'No Phone Number',
        description: `${user.full_name || 'User'} has no phone number on file.`,
        variant: 'destructive',
      });
      return;
    }

    setCallingUserId(user.user_id);
    onUserSelected?.(user);
    try {
      const region: CallRegion = user.phone.startsWith('+234') ? 'Nigeria' : 'USA';
      toast({
        title: 'Calling…',
        description: `Dialing ${user.full_name || user.phone}`,
      });
      await onInitiateCall('individual', region, [
        { phoneNumber: user.phone, displayName: user.full_name || undefined, userId: user.user_id },
      ]);
    } finally {
      setCallingUserId(null);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'driver': return 'default';
      case 'owner': return 'secondary';
      case 'admin': return 'destructive';
      default: return 'outline';
    }
  };

  const body = (
    <div className="space-y-4">
        {/* Search & Filter */}
        <div className="space-y-1.5">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or 'DRIVER CONTACTS'..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="driver">Drivers (All 600+)</SelectItem>
                <SelectItem value="owner">Owners</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Quick search:</span>
            <button
              type="button"
              className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline font-mono text-[11px]"
              onClick={() => setSearchQuery('DRIVER CONTACTS')}
            >
              📋 DRIVER CONTACTS (600+)
            </button>
            <span>·</span>
            <button
              type="button"
              className="text-primary hover:underline font-mono text-[11px]"
              onClick={() => setSearchQuery('driver_contacts_update_2026')}
            >
              2026 Roster (35)
            </button>
            <span>·</span>
            <button
              type="button"
              className="hover:underline font-mono text-[11px]"
              onClick={() => setSearchQuery('#drivers-2026')}
            >
              #drivers-2026
            </button>
          </div>
        </div>

        {/* Results */}
        {isSearching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : searchQuery.length < 2 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Type at least 2 characters to search
          </p>
        ) : users.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            No users found matching "{searchQuery}"
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.user_id}
                    className={user.phone ? 'cursor-pointer' : undefined}
                    onClick={() => user.phone && !isLoading && callingUserId !== user.user_id && handleCallUser(user)}
                  >
                    <TableCell className="font-medium">
                      {user.full_name || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.phone || 'No phone'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role) as any} className="capitalize">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleCallUser(user); }}
                        disabled={!user.phone || callingUserId === user.user_id || isLoading}
                      >
                        {callingUserId === user.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Phone className="h-4 w-4 mr-1" />
                            Call
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Search Users to Call
        </CardTitle>
        <CardDescription>
          Search drivers and owners by name, email, or phone number — selecting a user dials them immediately
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
};
