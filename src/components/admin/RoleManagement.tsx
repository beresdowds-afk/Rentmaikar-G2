import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Search, Users, Loader2, Mail, UserPlus, Trash2, AlertTriangle, History, Plus, ShieldCheck, CheckCircle2, XCircle, Send, MessageSquare, Power, PowerOff } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAssistantPermissions } from '@/hooks/useAssistantPermissions';
import { AdminAssistantManagement } from './AdminAssistantManagement';
import { SplitPane } from '@/components/ui/split-pane';

type AppRole = 'admin' | 'admin_assistant' | 'owner' | 'driver' | 'legal_support' | 'iot_support' | 'vehicle_support' | 'insurance_support';

interface UserWithRole {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  created_at: string;
  is_active: boolean;
}

interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  target_user_id: string;
  action: string;
  old_role: AppRole | null;
  new_role: AppRole | null;
  notes: string | null;
  created_at: string;
  actor_profile?: { full_name: string | null; email: string | null };
  target_profile?: { full_name: string | null; email: string | null };
}

const roleLabels: Record<AppRole, string> = {
  admin: 'Administrator',
  admin_assistant: 'Admin Assistant',
  owner: 'Vehicle Owner',
  driver: 'Driver',
  legal_support: 'Legal Support',
  iot_support: 'IoT Support',
  vehicle_support: 'Vehicle Support',
  insurance_support: 'Insurance Support',
};

const roleColors: Record<AppRole, string> = {
  admin: 'bg-destructive text-destructive-foreground',
  admin_assistant: 'bg-amber-500 text-white',
  owner: 'bg-primary text-primary-foreground',
  driver: 'bg-accent text-accent-foreground',
  legal_support: 'bg-blue-500 text-white',
  iot_support: 'bg-purple-500 text-white',
  vehicle_support: 'bg-orange-500 text-white',
  insurance_support: 'bg-teal-500 text-white',
};

const actionLabels: Record<string, string> = {
  created: 'User Created',
  role_assigned: 'Role Assigned',
  role_changed: 'Role Changed',
  role_removed: 'Role Removed',
  user_activated: 'User Activated',
  user_deactivated: 'User Deactivated',
};

export function RoleManagement() {
  const { user } = useAuth();
  // Admin assistants can read the roster (scoped by their granted
  // permissions at the database layer), but role mutations stay admin-only.
  const { isFullAdmin, isAssistant } = useAssistantPermissions();
  const canMutateRoles = isFullAdmin;
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AppRole | 'all'>('all');
  const [changeRoleDialogOpen, setChangeRoleDialogOpen] = useState(false);
  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = useState(false);
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [newRole, setNewRole] = useState<AppRole>('admin_assistant');
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const [auditActionFilter, setAuditActionFilter] = useState<'all' | 'activation' | 'role' | 'created'>('all');
  
  // New user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('admin_assistant');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<null | {
    email: string;
    phone: string | null;
    email_sent: boolean;
    sms_sent: boolean;
    email_error?: string | null;
    sms_error?: string | null;
    message: string;
    instructions: string;
  }>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [activationDialogOpen, setActivationDialogOpen] = useState(false);
  const [activationTarget, setActivationTarget] = useState<UserWithRole | null>(null);
  const [activationReason, setActivationReason] = useState('');
  const [activationLoading, setActivationLoading] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<Array<{ user_id: string; full_name: string | null; email: string | null; role: AppRole | null }>>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  const queryClient = useQueryClient();

  // Format as international phone: keep leading +, digits only after.
  const formatPhone = (raw: string) => {
    const hasPlus = raw.trim().startsWith('+');
    const digits = raw.replace(/[^\d]/g, '');
    return (hasPlus ? '+' : '') + digits;
  };

  const validatePhone = (raw: string): string | null => {
    if (!raw.trim()) return null;
    const cleaned = '+' + raw.replace(/[^\d]/g, '');
    if (!/^\+\d{8,15}$/.test(cleaned)) {
      return 'Enter a valid international number, e.g. +15551234567';
    }
    return null;
  };


  useEffect(() => {
    fetchUsersWithRoles();
    fetchAuditLogs();
  }, []);

  const fetchUsersWithRoles = async () => {
    try {
      setLoading(true);
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, created_at, is_active');

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || [])
        .map(profile => {
          const userRole = roles?.find(r => r.user_id === profile.user_id);
          if (!userRole) return null;
          return {
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name,
            email: profile.email,
            role: userRole.role as AppRole,
            created_at: profile.created_at || '',
            is_active: profile.is_active !== false,
          };
        })
        .filter((u): u is UserWithRole => u !== null);

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users with roles');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLogsLoading(true);
      
      const { data: logs, error: logsError } = await supabase
        .from('role_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      // Fetch profiles for actors and targets
      const userIds = new Set<string>();
      logs?.forEach(log => {
        if (log.actor_id) userIds.add(log.actor_id);
        if (log.target_user_id) userIds.add(log.target_user_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', Array.from(userIds));

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]));

      const enrichedLogs: AuditLogEntry[] = (logs || []).map(log => ({
        ...log,
        actor_profile: log.actor_id ? profilesMap.get(log.actor_id) : undefined,
        target_profile: profilesMap.get(log.target_user_id),
      }));

      setAuditLogs(enrichedLogs);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      toast.error('Failed to fetch audit logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const logAuditEntry = async (
    targetUserId: string,
    action: string,
    oldRole?: AppRole | null,
    newRole?: AppRole | null,
    notes?: string
  ) => {
    try {
      await supabase.from('role_audit_log').insert({
        actor_id: user?.id,
        target_user_id: targetUserId,
        action,
        old_role: oldRole || null,
        new_role: newRole || null,
        notes: notes || null,
      });
    } catch (error) {
      console.error('Failed to log audit entry:', error);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserFullName) {
      toast.error('Please provide the user\'s full name and email');
      return;
    }

    const phoneValidationError = validatePhone(newUserPhone);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      toast.error(phoneValidationError);
      return;
    }
    setPhoneError(null);

    const normalizedPhone = newUserPhone.trim()
      ? '+' + newUserPhone.replace(/[^\d]/g, '')
      : undefined;

    setIsUpdating(true);
    setCreateResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'admin-create-user',
        {
          body: {
            email: newUserEmail,
            full_name: newUserFullName,
            role: newUserRole,
            phone: normalizedPhone,
          },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCreateResult({
        email: data.email,
        phone: data.phone,
        email_sent: !!data.email_sent,
        sms_sent: !!data.sms_sent,
        email_error: data.email_error,
        sms_error: data.sms_error,
        message: data.message,
        instructions: data.instructions,
      });

      toast.success('User created', { description: data.message });

      // Reset input fields but keep the dialog open to display result.
      setNewUserEmail('');
      setNewUserFullName('');
      setNewUserPhone('');
      setNewUserRole('admin_assistant');

      fetchUsersWithRoles();
      fetchAuditLogs();
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });

    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user', {
        description: error.message,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResendReset = async (target: UserWithRole) => {
    if (!target.email) {
      toast.error('This user has no email on file');
      return;
    }
    setResendingId(target.user_id);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
        redirectTo,
      });
      if (error) throw error;

      await logAuditEntry(
        target.user_id,
        'role_assigned',
        null,
        target.role,
        JSON.stringify({
          summary: 'Reset link resent by administrator',
          email: target.email,
          email_sent: true,
        })
      );

      toast.success('Reset link sent', {
        description: `A new password-reset email is on its way to ${target.email}.`,
      });
      fetchAuditLogs();
    } catch (err: any) {
      console.error('Resend reset failed:', err);
      toast.error('Could not resend reset link', { description: err.message });
    } finally {
      setResendingId(null);
    }
  };



  const openActivationDialog = async (target: UserWithRole) => {
    setActivationTarget(target);
    setActivationReason('');
    setLinkedAccounts([]);
    setActivationDialogOpen(true);
    setLinkedLoading(true);
    try {
      const { data: links, error } = await supabase.rpc('get_linked_user_ids', { _user_id: target.user_id });
      if (error) throw error;
      const ids = (links || []).map((r: any) => r.linked_user_id).filter(Boolean);
      if (ids.length === 0) {
        setLinkedAccounts([]);
      } else {
        const [{ data: profs }, { data: rolesData }] = await Promise.all([
          supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids),
          supabase.from('user_roles').select('user_id, role').in('user_id', ids),
        ]);
        const roleMap = new Map<string, AppRole>((rolesData || []).map((r: any) => [r.user_id, r.role]));
        setLinkedAccounts((profs || []).map((p: any) => ({
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          role: roleMap.get(p.user_id) ?? null,
        })));
      }
    } catch (err: any) {
      console.error('Failed to fetch linked accounts:', err);
    } finally {
      setLinkedLoading(false);
    }
  };


  const handleToggleActivation = async () => {
    if (!activationTarget) return;
    if (activationReason.trim().length < 5) {
      toast.error('Please provide a reason (at least 5 characters).');
      return;
    }
    setActivationLoading(true);
    try {
      const nextActive = !activationTarget.is_active;
      const { data, error } = await supabase.functions.invoke('admin-set-user-active', {
        body: {
          target_user_id: activationTarget.user_id,
          active: nextActive,
          reason: activationReason.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(nextActive ? 'User activated' : 'User deactivated', {
        description: `${activationTarget.full_name || activationTarget.email} — access ${nextActive ? 'restored' : 'blocked'}.`,
      });
      setActivationDialogOpen(false);
      fetchUsersWithRoles();
      fetchAuditLogs();
    } catch (err: any) {
      console.error('Activation toggle failed:', err);
      toast.error('Could not update activation', { description: err.message });
    } finally {
      setActivationLoading(false);
    }
  };

  const handleChangeRole = async () => {
    if (!selectedUser || !newRole) return;

    setIsUpdating(true);
    try {
      const oldRole = selectedUser.role;
      
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', selectedUser.user_id);

      if (error) throw error;

      // Log the audit entry
      await logAuditEntry(
        selectedUser.user_id,
        'role_changed',
        oldRole,
        newRole,
        `Role changed from ${roleLabels[oldRole]} to ${roleLabels[newRole]}`
      );

      toast.success(`Role updated to ${roleLabels[newRole]}`, {
        description: `${selectedUser.full_name || selectedUser.email}'s role has been changed.`,
      });

      setChangeRoleDialogOpen(false);
      fetchUsersWithRoles();
      fetchAuditLogs();
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role', {
        description: error.message,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedUser) return;

    setIsUpdating(true);
    try {
      const oldRole = selectedUser.role;
      
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', selectedUser.user_id);

      if (error) throw error;

      // Log the audit entry
      await logAuditEntry(
        selectedUser.user_id,
        'role_removed',
        oldRole,
        null,
        `Role ${roleLabels[oldRole]} was removed`
      );

      toast.success('Role removed', {
        description: `${selectedUser.full_name || selectedUser.email}'s role has been removed.`,
      });

      setDeleteRoleDialogOpen(false);
      fetchUsersWithRoles();
      fetchAuditLogs();
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
    } catch (error: any) {
      console.error('Error deleting role:', error);
      toast.error('Failed to remove role', {
        description: error.message,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const openChangeRoleDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setChangeRoleDialogOpen(true);
  };

  const openDeleteRoleDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setDeleteRoleDialogOpen(true);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleCounts = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading role assignments...</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Role Management
              </CardTitle>
              <CardDescription>
                {canMutateRoles
                  ? 'Assign and manage user roles across the platform'
                  : 'Read-only view of the platform roster, scoped to your granted permissions. Role changes are reserved for full admins.'}
              </CardDescription>
            </div>
            {canMutateRoles && (
              <Button onClick={() => setCreateUserDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create New User
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-4 w-4" />
                Users ({users.length})
              </TabsTrigger>
              <TabsTrigger value="assistants" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Admin Assistants
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <History className="h-4 w-4" />
                Audit Log ({auditLogs.length})
              </TabsTrigger>
            </TabsList>


            <TabsContent value="users">
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AppRole | 'all')}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles ({users.length})</SelectItem>
                    <SelectItem value="admin">Admin ({roleCounts.admin || 0})</SelectItem>
                    <SelectItem value="admin_assistant">Admin Assistant ({roleCounts.admin_assistant || 0})</SelectItem>
                    <SelectItem value="owner">Owner ({roleCounts.owner || 0})</SelectItem>
                    <SelectItem value="driver">Driver ({roleCounts.driver || 0})</SelectItem>
                    <SelectItem value="legal_support">Legal Support ({roleCounts.legal_support || 0})</SelectItem>
                    <SelectItem value="iot_support">IoT Support ({roleCounts.iot_support || 0})</SelectItem>
                    <SelectItem value="vehicle_support">Vehicle Support ({roleCounts.vehicle_support || 0})</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Role Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {(Object.keys(roleLabels) as AppRole[]).map((role) => (
                  <Card 
                    key={role} 
                    className={`p-3 cursor-pointer transition-all hover:shadow-md ${roleFilter === role ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
                  >
                    <div className="text-center">
                      <Badge className={roleColors[role]}>{roleLabels[role]}</Badge>
                      <p className="text-2xl font-bold mt-2">{roleCounts[role] || 0}</p>
                    </div>
                  </Card>
                ))}
              </div>

              {/* User List — split-pane on xl+, stacked below */}
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No users found with the selected criteria</p>
                </div>
              ) : (() => {
                const selectedUser =
                  filteredUsers.find((u) => u.id === selectedUserId) ??
                  users.find((u) => u.id === selectedUserId) ??
                  null;

                const list = (
                  <div className="space-y-3">
                    {filteredUsers.map((user) => {
                      const isSelected = selectedUserId === user.id;
                      return (
                        <Card
                          key={user.id}
                          role="button"
                          tabIndex={0}
                          aria-selected={isSelected}
                          onClick={() => setSelectedUserId(user.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedUserId(user.id);
                            }
                          }}
                          className={`hover:shadow-md transition-shadow cursor-pointer ${
                            isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
                          }`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap xl:flex-nowrap">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 shrink-0 rounded-full bg-muted flex items-center justify-center">
                                  <Shield className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-semibold truncate">{user.full_name || 'No name'}</h3>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                                    <Mail className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{user.email || 'No email'}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 xl:hidden">
                                <Badge className={roleColors[user.role]}>
                                  {roleLabels[user.role]}
                                </Badge>
                                {canMutateRoles && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleResendReset(user); }}
                                      disabled={resendingId === user.user_id || !user.email}
                                      className="gap-1"
                                      title="Resend password-reset email"
                                    >
                                      {resendingId === user.user_id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Send className="h-4 w-4" />
                                      )}
                                      Resend
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); openChangeRoleDialog(user); }}
                                      className="gap-1"
                                    >
                                      <UserPlus className="h-4 w-4" />
                                      Change
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); openDeleteRoleDialog(user); }}
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                              <Badge className={`hidden xl:inline-flex ${roleColors[user.role]}`}>
                                {roleLabels[user.role]}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                );

                const detail = selectedUser && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Shield className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">
                          {selectedUser.full_name || 'No name'}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {selectedUser.email || 'No email'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Role</p>
                        <Badge className={`mt-1 ${roleColors[selectedUser.role]}`}>
                          {roleLabels[selectedUser.role]}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                        <Badge
                          className={`mt-1 gap-1 ${selectedUser.is_active ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}
                        >
                          {selectedUser.is_active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {selectedUser.is_active ? 'Active' : 'Deactivated'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Created</p>
                        <p className="mt-1">{formatDate(selectedUser.created_at)}</p>
                      </div>
                    </div>
                    {canMutateRoles ? (
                      <>
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResendReset(selectedUser)}
                            disabled={resendingId === selectedUser.user_id || !selectedUser.email}
                            className="gap-1"
                          >
                            {resendingId === selectedUser.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Resend reset link
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openChangeRoleDialog(selectedUser)}
                            className="gap-1"
                          >
                            <UserPlus className="h-4 w-4" />
                            Change role
                          </Button>
                          <Button
                            variant={selectedUser.is_active ? 'outline' : 'default'}
                            size="sm"
                            onClick={() => openActivationDialog(selectedUser)}
                            className={`gap-1 ${
                              selectedUser.is_active
                                ? 'text-amber-600 border-amber-500/40 hover:bg-amber-500/10'
                                : ''
                            }`}
                            title={
                              selectedUser.is_active
                                ? 'Block sign-in and hide this user\'s dashboard until reactivated'
                                : 'Restore sign-in and dashboard access'
                            }
                          >
                            {selectedUser.is_active ? (
                              <>
                                <PowerOff className="h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Power className="h-4 w-4" />
                                Activate
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteRoleDialog(selectedUser)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove role
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Deactivating a user immediately blocks their sign-in, hides their dashboard,
                          and records the reason in the audit log. Reactivating restores access.
                          Drivers and owners deactivated here also disappear from the Admin Assistant dashboard.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground pt-2 border-t">
                        {isAssistant
                          ? 'You have read-only access to role details. Ask a full admin to change roles, activate, or deactivate an account.'
                          : 'Role actions require full admin access.'}
                      </p>
                    )}
                  </div>
                );


                return (
                  <SplitPane
                    list={list}
                    detail={detail}
                    hasSelection={!!selectedUser}
                    emptyState={
                      <div className="text-center text-sm text-muted-foreground py-16">
                        <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        Select a user to see role details and quick actions.
                      </div>
                    }
                  />
                );
              })()}
            </TabsContent>

            <TabsContent value="assistants">
              <AdminAssistantManagement />
            </TabsContent>

            <TabsContent value="audit">
              {logsLoading ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading audit logs...</p>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No audit logs found</p>
                </div>
              ) : (() => {
                const filteredLogs = auditLogs.filter(l => {
                  if (auditActionFilter === 'all') return true;
                  if (auditActionFilter === 'activation') return l.action === 'user_activated' || l.action === 'user_deactivated';
                  if (auditActionFilter === 'role') return l.action === 'role_assigned' || l.action === 'role_changed' || l.action === 'role_removed';
                  if (auditActionFilter === 'created') return l.action === 'created';
                  return true;
                });
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-sm text-muted-foreground">Filter:</span>
                      {([
                        ['all', `All (${auditLogs.length})`],
                        ['activation', `Activation (${auditLogs.filter(l => l.action === 'user_activated' || l.action === 'user_deactivated').length})`],
                        ['role', `Role changes (${auditLogs.filter(l => l.action.startsWith('role_')).length})`],
                        ['created', `User created (${auditLogs.filter(l => l.action === 'created').length})`],
                      ] as const).map(([val, label]) => (
                        <Button
                          key={val}
                          size="sm"
                          variant={auditActionFilter === val ? 'default' : 'outline'}
                          onClick={() => setAuditActionFilter(val as any)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    {filteredLogs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p>No entries match this filter.</p>
                      </div>
                    ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3 pr-4">
                    {filteredLogs.map(log => {
                      const isActivation = log.action === 'user_activated' || log.action === 'user_deactivated';
                      return (
                      <Card key={log.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                {log.action === 'user_activated' ? <Power className="h-5 w-5 text-emerald-600" /> :
                                 log.action === 'user_deactivated' ? <PowerOff className="h-5 w-5 text-amber-600" /> :
                                 <History className="h-5 w-5 text-muted-foreground" />}
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className={
                                      log.action === 'user_deactivated' ? 'border-amber-500/40 text-amber-700' :
                                      log.action === 'user_activated' ? 'border-emerald-500/40 text-emerald-700' :
                                      ''
                                    }
                                  >
                                    {actionLabels[log.action] || log.action}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {formatDate(log.created_at)}
                                  </span>
                                </div>
                                <p className="text-sm">
                                  <span className="font-medium">
                                    {log.target_profile?.full_name || log.target_profile?.email || 'Unknown User'}
                                  </span>
                                </p>
                                {log.old_role && log.new_role && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Badge className={roleColors[log.old_role]}>{roleLabels[log.old_role]}</Badge>
                                    <span className="text-muted-foreground">→</span>
                                    <Badge className={roleColors[log.new_role]}>{roleLabels[log.new_role]}</Badge>
                                  </div>
                                )}
                                {log.new_role && !log.old_role && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Assigned:</span>
                                    <Badge className={roleColors[log.new_role]}>{roleLabels[log.new_role]}</Badge>
                                  </div>
                                )}
                                {log.old_role && !log.new_role && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Removed:</span>
                                    <Badge className={roleColors[log.old_role]}>{roleLabels[log.old_role]}</Badge>
                                  </div>
                                )}
                                {log.notes && (() => {
                                  let parsed: any = null;
                                  try { parsed = JSON.parse(log.notes); } catch { /* plain text */ }
                                  if (!parsed || typeof parsed !== 'object') {
                                    return <p className="text-sm text-muted-foreground italic">{log.notes}</p>;
                                  }
                                  return (
                                    <div className="text-sm text-muted-foreground space-y-1">
                                      {parsed.summary && <p className="italic">{parsed.summary}</p>}
                                      {isActivation && parsed.reason && (
                                        <div className="rounded-md border border-border/60 bg-muted/40 p-2">
                                          <p className="text-xs uppercase tracking-wide text-muted-foreground/80 mb-0.5">Reason</p>
                                          <p className="text-sm text-foreground/90">{parsed.reason}</p>
                                        </div>
                                      )}
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        {isActivation && parsed.actor_kind && (
                                          <Badge variant="outline" className="gap-1">
                                            <ShieldCheck className="h-3 w-3" />
                                            {parsed.actor_kind === 'admin' ? 'By admin' : 'By admin assistant'}
                                          </Badge>
                                        )}
                                        {isActivation && Array.isArray(parsed.target_roles) && parsed.target_roles.length > 0 && (
                                          <Badge variant="outline">Target: {parsed.target_roles.join(', ')}</Badge>
                                        )}
                                        {typeof parsed.email_sent === 'boolean' && (
                                          <Badge variant={parsed.email_sent ? 'default' : 'destructive'} className="gap-1">
                                            <Mail className="h-3 w-3" />
                                            Email {parsed.email_sent ? 'sent' : 'failed'}
                                          </Badge>
                                        )}
                                        {parsed.phone && (
                                          <Badge variant={parsed.sms_sent ? 'default' : 'destructive'} className="gap-1">
                                            <MessageSquare className="h-3 w-3" />
                                            SMS {parsed.sms_sent ? 'sent' : 'failed'}
                                          </Badge>
                                        )}
                                        {parsed.email && <span>· {parsed.email}</span>}
                                        {parsed.phone && <span>· {parsed.phone}</span>}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="text-right text-sm text-muted-foreground">
                              <p>By: {log.actor_profile?.full_name || log.actor_profile?.email || 'System'}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
                    )}
                  </>
                );
              })()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={createUserDialogOpen}
        onOpenChange={(open) => {
          setCreateUserDialogOpen(open);
          if (!open) {
            setCreateResult(null);
            setPhoneError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Create a new user account with a specific role
            </DialogDescription>
          </DialogHeader>

          {createResult ? (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <p className="font-semibold text-foreground">
                  {createResult.message}
                </p>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    {createResult.email_sent ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Password-reset email to{' '}
                      <strong>{createResult.email}</strong>:{' '}
                      {createResult.email_sent ? 'sent' : 'failed'}
                    </span>
                  </div>
                  {createResult.email_error && (
                    <p className="text-xs text-destructive pl-6">
                      {createResult.email_error}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    {createResult.phone ? (
                      createResult.sms_sent ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )
                    ) : (
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    )}
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {createResult.phone
                        ? `SMS to ${createResult.phone}: ${
                            createResult.sms_sent ? 'sent' : 'failed'
                          }`
                        : 'No phone provided — SMS skipped.'}
                    </span>
                  </div>
                  {createResult.sms_error && (
                    <p className="text-xs text-destructive pl-6">
                      {createResult.sms_error}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-semibold">Login &amp; reset instructions</p>
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
                  {createResult.instructions}
                </pre>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateResult(null);
                  }}
                >
                  Create another user
                </Button>
                <Button onClick={() => setCreateUserDialogOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full Name</Label>
                  <Input
                    id="full-name"
                    placeholder="Enter full name"
                    value={newUserFullName}
                    onChange={(e) => setNewUserFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Phone (optional, for SMS notification)
                  </Label>
                  <PhoneNumberInput
                    id="phone"
                    value={newUserPhone}
                    onChange={(v) => {
                      const formatted = formatPhone(v);
                      setNewUserPhone(formatted);
                      setPhoneError(validatePhone(formatted));
                    }}
                    aria-invalid={!!phoneError}
                  />
                  {phoneError ? (
                    <p className="text-xs text-destructive">{phoneError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      International format, e.g. +15551234567 or +2348012345678.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                  <p>
                    <strong className="text-foreground">
                      No initial password needed.
                    </strong>{' '}
                    The new user will receive an email (and SMS if a phone is
                    provided) asking them to sign in as soon as possible and
                    set their own password via the <em>Forgot password</em>{' '}
                    flow.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={newUserRole}
                    onValueChange={(v) => setNewUserRole(v as AppRole)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        [
                          'admin',
                          'admin_assistant',
                          'legal_support',
                          'iot_support',
                          'vehicle_support',
                          'insurance_support',
                        ] as AppRole[]
                      ).map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Drivers and vehicle owners must self-register through the public signup so they
                    complete identity and address verification themselves — they can't be created here.
                  </p>
                </div>
                {newUserRole === 'admin' && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-2 text-destructive text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">
                        Warning: Admin role grants full platform access
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateUserDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateUser}
                  disabled={isUpdating || !!phoneError}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create User'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>


      {/* Change Role Dialog */}
      <Dialog open={changeRoleDialogOpen} onOpenChange={setChangeRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Change User Role
            </DialogTitle>
            <DialogDescription>
              Update the role for {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Role</Label>
              <Badge className={selectedUser ? roleColors[selectedUser.role] : ''}>
                {selectedUser ? roleLabels[selectedUser.role] : ''}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">New Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(roleLabels) as AppRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newRole === 'admin' && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Warning: Admin role grants full platform access</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangeRole} disabled={isUpdating || newRole === selectedUser?.role}>
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                'Update Role'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Dialog */}
      <Dialog open={deleteRoleDialogOpen} onOpenChange={setDeleteRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Remove User Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the role for {selectedUser?.full_name || selectedUser?.email}? 
              This will revoke all their access to the platform.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Removing...
                </>
              ) : (
                'Remove Role'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activation / Deactivation Dialog */}
      <Dialog open={activationDialogOpen} onOpenChange={setActivationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activationTarget?.is_active ? (
                <>
                  <PowerOff className="h-5 w-5 text-amber-600" />
                  Deactivate user
                </>
              ) : (
                <>
                  <Power className="h-5 w-5 text-emerald-600" />
                  Reactivate user
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {activationTarget?.is_active
                ? `Deactivating ${activationTarget?.full_name || activationTarget?.email} blocks their sign-in and hides their dashboard everywhere on the platform. This is mirrored on the Admin Assistant dashboard.`
                : `Reactivating ${activationTarget?.full_name || activationTarget?.email} restores their sign-in and dashboard.`}
            </DialogDescription>
          </DialogHeader>
          {(linkedLoading || linkedAccounts.length > 0) && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {linkedLoading
                  ? 'Checking for linked (couple/partner) accounts…'
                  : `This change will also ${activationTarget?.is_active ? 'deactivate' : 'reactivate'} ${linkedAccounts.length} linked account${linkedAccounts.length === 1 ? '' : 's'}:`}
              </div>
              {!linkedLoading && linkedAccounts.length > 0 && (
                <ul className="space-y-1 pl-6 list-disc">
                  {linkedAccounts.map((a) => (
                    <li key={a.user_id}>
                      <span className="font-medium">{a.full_name || a.email || a.user_id}</span>
                      {a.role && <Badge className={`ml-2 ${roleColors[a.role]}`}>{roleLabels[a.role]}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
              {!linkedLoading && linkedAccounts.length > 0 && (
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                  Linked accounts share activation status. To change only one account, first remove the link from the Drivers &amp; Owners portal.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2 py-2">
            <Label htmlFor="activation-reason">Reason (required)</Label>
            <Textarea
              id="activation-reason"
              value={activationReason}
              onChange={(e) => setActivationReason(e.target.value)}
              placeholder={
                activationTarget?.is_active
                  ? 'e.g. Repeated payment defaults; suspending pending investigation.'
                  : 'e.g. Issue resolved with driver; restoring access.'
              }
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              This reason is recorded in the audit log and visible to other admins.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivationDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={activationTarget?.is_active ? 'destructive' : 'default'}
              onClick={handleToggleActivation}
              disabled={activationLoading || activationReason.trim().length < 5}
            >
              {activationLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : activationTarget?.is_active ? (
                'Deactivate user'
              ) : (
                'Reactivate user'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
