import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Sparkles,
  Car,
  UserCheck,
  ShieldAlert,
  Wallet,
  Phone,
  MessageSquare,
  Mail,
  ArrowRight,
  Search,
  Loader2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneForDisplay } from '@/types/voip';
import { useCommunicationsHub } from './CommunicationsHubContext';

interface ContextUser {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: 'driver' | 'owner' | 'customer' | 'staff';
  subtitle?: string;
}

export const HubContextActions: React.FC = () => {
  const location = useLocation();
  const { openWithRecipient } = useCommunicationsHub();

  const [relevantUsers, setRelevantUsers] = useState<ContextUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Determine current contextual domain
  const contextDomain = React.useMemo(() => {
    const path = location.pathname;
    const search = location.search;

    if (path.includes('owner') || search.includes('owners')) {
      return {
        key: 'owner',
        title: 'Vehicle Owner Operations Context',
        description: 'Context-linked to vehicle hosts, asset management, and weekly revenue disbursements.',
        primaryRole: 'owner',
        icon: <Wallet className="h-4 w-4 text-emerald-600" />,
        badgeText: 'Owner Portal',
      };
    }

    if (path.includes('driver') || path.includes('vehicle') || path.includes('matching') || search.includes('drivers')) {
      return {
        key: 'driver',
        title: 'Driver Fleet Operations Context',
        description: 'Context-linked to active rideshare drivers, inspection checks, and vehicle assignments.',
        primaryRole: 'driver',
        icon: <Car className="h-4 w-4 text-blue-600" />,
        badgeText: 'Driver Operations',
      };
    }

    if (path.includes('case') || path.includes('dispute') || path.includes('document')) {
      return {
        key: 'support',
        title: 'Support & Case Resolution Context',
        description: 'Context-linked to open incidents, compliance verifications, and dispute mediation.',
        primaryRole: 'all',
        icon: <ShieldAlert className="h-4 w-4 text-amber-600" />,
        badgeText: 'Compliance & Cases',
      };
    }

    return {
      key: 'general',
      title: 'Platform Administration Context',
      description: 'Quick-action access to all verified drivers, owners, and operations staff across active regions.',
      primaryRole: 'all',
      icon: <Sparkles className="h-4 w-4 text-primary" />,
      badgeText: 'Platform-Wide',
    };
  }, [location.pathname, location.search]);

  // Fetch relevant users based on the active context
  useEffect(() => {
    let cancelled = false;

    const fetchContextUsers = async () => {
      setIsLoading(true);
      try {
        let rolesToFetch = ['driver', 'owner'];
        if (contextDomain.primaryRole === 'driver') rolesToFetch = ['driver'];
        if (contextDomain.primaryRole === 'owner') rolesToFetch = ['owner'];

        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('role', rolesToFetch)
          .limit(30);

        if (cancelled) return;

        const uids = (userRoles || []).map((r) => r.user_id);
        if (!uids.length) {
          setRelevantUsers([]);
          return;
        }

        const roleMap = new Map((userRoles || []).map((r) => [r.user_id, r.role]));

        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .in('user_id', uids)
          .limit(20);

        if (cancelled) return;

        const mapped: ContextUser[] = (profiles || []).map((p) => ({
          userId: p.user_id,
          name: p.full_name || p.email || 'User',
          phone: p.phone,
          email: p.email,
          role: (roleMap.get(p.user_id) as any) || 'driver',
          subtitle: p.email || p.phone || undefined,
        }));

        setRelevantUsers(mapped);
      } catch (err) {
        console.error('Error fetching context users:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchContextUsers();

    return () => {
      cancelled = true;
    };
  }, [contextDomain]);

  const filteredUsers = relevantUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q))
    );
  });

  const handleQuickCall = (user: ContextUser) => {
    openWithRecipient({
      name: user.name,
      phone: user.phone,
      userId: user.userId,
      role: user.role,
      defaultAction: 'call',
    });
  };

  const handleQuickMessage = (user: ContextUser, channel: 'sms' | 'whatsapp' | 'email') => {
    openWithRecipient({
      name: user.name,
      phone: user.phone,
      email: user.email,
      userId: user.userId,
      role: user.role,
      defaultAction: 'message',
      defaultChannel: channel,
    });
  };

  return (
    <div className="space-y-3.5">
      {/* Context Domain Header Card */}
      <div className="bg-muted/40 border border-border/80 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
            {contextDomain.icon}
            <span>{contextDomain.title}</span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-background">
            {contextDomain.badgeText}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {contextDomain.description}
        </p>
      </div>

      {/* Directory Search & Filter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>Target Profiles in Current Context</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {filteredUsers.length} available
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filtered profiles..."
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>
      </div>

      {/* Profile List */}
      <div className="divide-y divide-border/60 border border-border/80 rounded-xl overflow-hidden bg-card max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading contextual profiles...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No profiles match the current filter.
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.userId} className="p-2.5 flex items-center justify-between hover:bg-muted/40 transition gap-2">
              <div className="truncate min-w-0 pr-2">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs font-semibold text-foreground truncate">{u.name}</span>
                  <Badge variant="secondary" className="text-[9px] py-0 px-1 capitalize shrink-0">
                    {u.role}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground truncate font-mono">
                  {u.phone ? formatPhoneForDisplay(u.phone) : u.email || 'No contact on file'}
                </div>
              </div>

              {/* Quick Communication Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {u.phone && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30"
                    onClick={() => handleQuickCall(u)}
                    title={`Call ${u.name} via VoIP`}
                  >
                    <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  </Button>
                )}

                {u.phone && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/30"
                    onClick={() => handleQuickMessage(u, 'sms')}
                    title={`Send SMS to ${u.name}`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                  </Button>
                )}

                {u.email && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30"
                    onClick={() => handleQuickMessage(u, 'email')}
                    title={`Send Email to ${u.name}`}
                  >
                    <Mail className="h-3.5 w-3.5 text-blue-600" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
