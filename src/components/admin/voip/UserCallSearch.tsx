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
        // Search profiles
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
          .limit(20);

        if (profileError) throw profileError;

        // Get roles for these users
        const userIds = (profiles || []).map(p => p.user_id);
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);

        const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));

        const results: UserResult[] = (profiles || []).map(p => ({
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          role: roleMap.get(p.user_id) || 'user',
        }));

        // Filter by role
        const filtered = roleFilter === 'all'
          ? results.filter(u => ['driver', 'owner'].includes(u.role))
          : results.filter(u => u.role === roleFilter);

        setUsers(filtered);
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
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
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
              <SelectItem value="driver">Drivers</SelectItem>
              <SelectItem value="owner">Owners</SelectItem>
            </SelectContent>
          </Select>
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
