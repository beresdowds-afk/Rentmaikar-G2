import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { assignRole, revokeRole } from '@/lib/user-provisioning';
import { roleForSupportType } from '@/lib/support-role-map';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  UserPlus, 
  Trash2, 
  Search, 
  Loader2, 
  Shield, 
  Scale, 
  Cpu, 
  Car,
  Users,
  CheckCircle,
  XCircle,
  RefreshCw,
  MapPin,
  ArrowRightLeft,
  Pencil,
  Save,
  X,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { CITIES_BY_REGION, type SupportTaskType } from '@/types/support';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface SupportStaffMember {
  id: string;
  user_id: string;
  support_type: string;
  assigned_city: string;
  assigned_region: string;
  is_active: boolean;
  phone?: string;
  notes?: string;
  created_at: string;
  profile?: {
    full_name: string;
    email: string;
  };
}

const SUPPORT_TYPES = [
  { value: 'legal', label: 'Legal Support', icon: Scale, role: 'legal_support' },
  { value: 'iot_installation', label: 'IoT Installation', icon: Cpu, role: 'iot_support' },
  { value: 'iot_maintenance', label: 'IoT Maintenance', icon: Cpu, role: 'iot_support' },
  { value: 'vehicle_recall', label: 'Vehicle Recall', icon: Car, role: 'vehicle_support' },
  { value: 'vehicle_maintenance', label: 'Vehicle Maintenance', icon: Car, role: 'vehicle_support' },
];

export const SupportUserManagement = () => {
  const [staff, setStaff] = useState<SupportStaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'staff' | 'coverage'>('staff');

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    support_type: '',
    assigned_city: '',
    assigned_region: '',
    phone: '',
  });

  // Transfer dialog state
  const [transferTarget, setTransferTarget] = useState<SupportStaffMember | null>(null);
  const [transferCity, setTransferCity] = useState('');
  const [transferRegion, setTransferRegion] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Registration form state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    supportType: '' as SupportTaskType,
    assignedCity: '',
    assignedRegion: 'Nigeria',
  });

  // Onboard existing user state
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardUser, setOnboardUser] = useState({
    email: '',
    supportType: '' as SupportTaskType,
    assignedCity: '',
    assignedRegion: 'Nigeria',
    phone: '',
  });

  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_staff')
        .select(`
          *,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const formattedStaff = (data || []).map((s: any) => ({
        ...s,
        profile: s.profiles,
      }));
      setStaff(formattedStaff as SupportStaffMember[]);
    } catch (err) {
      console.error('Error fetching staff:', err);
      toast.error('Failed to load support staff');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  // Register new support user
  const handleRegisterUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.fullName || !newUser.supportType || !newUser.assignedCity) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsRegistering(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            full_name: newUser.fullName,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      await new Promise(resolve => setTimeout(resolve, 1000));

      const { error: staffError } = await supabase
        .from('support_staff')
        .insert([{
          user_id: authData.user.id,
          support_type: newUser.supportType,
          assigned_city: newUser.assignedCity,
          assigned_region: newUser.assignedRegion,
          phone: newUser.phone || null,
          is_active: true,
        }]);

      if (staffError) throw staffError;


      const role = roleForSupportType(newUser.supportType);
      if (role) {
        await assignRole(authData.user.id, role, newUser.email);
      }

      toast.success('Support user registered successfully');
      setIsRegisterOpen(false);
      setNewUser({
        email: '',
        password: '',
        fullName: '',
        phone: '',
        supportType: '' as SupportTaskType,
        assignedCity: '',
        assignedRegion: 'Nigeria',
      });
      fetchStaff();
    } catch (err: any) {
      console.error('Error registering user:', err);
      toast.error(err.message || 'Failed to register user');
    } finally {
      setIsRegistering(false);
    }
  };

  // Onboard existing user as support staff
  const handleOnboardUser = async () => {
    if (!onboardUser.email || !onboardUser.supportType || !onboardUser.assignedCity) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsOnboarding(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, email')
        .eq('email', onboardUser.email)
        .maybeSingle();

      if (profileError || !profileData) {
        toast.error('User not found with that email');
        setIsOnboarding(false);
        return;
      }

      const { data: existingStaff } = await supabase
        .from('support_staff')
        .select('id')
        .eq('user_id', profileData.user_id)
        .eq('support_type', onboardUser.supportType)
        .maybeSingle();

      if (existingStaff) {
        toast.error('User is already registered as this type of support staff');
        setIsOnboarding(false);
        return;
      }

      const { error: staffError } = await supabase
        .from('support_staff')
        .insert([{
          user_id: profileData.user_id,
          support_type: onboardUser.supportType,
          assigned_city: onboardUser.assignedCity,
          assigned_region: onboardUser.assignedRegion,
          phone: onboardUser.phone || null,
          is_active: true,
        }]);

      if (staffError) throw staffError;


      const role = roleForSupportType(onboardUser.supportType);
      if (role) {
        await assignRole(profileData.user_id, role, profileData.email);
      }

      toast.success('User onboarded as support staff');
      setIsOnboardOpen(false);
      setOnboardUser({
        email: '',
        supportType: '' as SupportTaskType,
        assignedCity: '',
        assignedRegion: 'Nigeria',
        phone: '',
      });
      fetchStaff();
    } catch (err: any) {
      console.error('Error onboarding user:', err);
      toast.error(err.message || 'Failed to onboard user');
    } finally {
      setIsOnboarding(false);
    }
  };

  // Toggle staff active status
  const handleToggleActive = async (staffId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('support_staff')
        .update({ is_active: !currentStatus })
        .eq('id', staffId);

      if (error) throw error;
      toast.success(`Staff ${currentStatus ? 'deactivated' : 'activated'}`);
      fetchStaff();
    } catch (err) {
      console.error('Error toggling status:', err);
      toast.error('Failed to update status');
    }
  };

  // Remove staff member
  const handleRemoveStaff = async (staffId: string, userId: string, supportType: string) => {
    if (!confirm('Are you sure you want to remove this support staff member? This will also remove their support role.')) return;

    try {
      const { error: staffError } = await supabase
        .from('support_staff')
        .delete()
        .eq('id', staffId);

      if (staffError) throw staffError;

      
      const role = roleForSupportType(supportType);
      if (role) {
        await revokeRole(userId, role);
      }

      toast.success('Support staff removed');
      fetchStaff();
    } catch (err) {
      console.error('Error removing staff:', err);
      toast.error('Failed to remove staff member');
    }
  };

  // Inline edit handlers
  const startEditing = (member: SupportStaffMember) => {
    setEditingId(member.id);
    setEditForm({
      support_type: member.support_type,
      assigned_city: member.assigned_city,
      assigned_region: member.assigned_region,
      phone: member.phone || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({ support_type: '', assigned_city: '', assigned_region: '', phone: '' });
  };

  const saveEditing = async (member: SupportStaffMember) => {
    try {
      const updates: Record<string, any> = {};
      let roleChanged = false;

      if (editForm.assigned_city !== member.assigned_city) updates.assigned_city = editForm.assigned_city;
      if (editForm.assigned_region !== member.assigned_region) updates.assigned_region = editForm.assigned_region;
      if (editForm.phone !== (member.phone || '')) updates.phone = editForm.phone || null;
      if (editForm.support_type !== member.support_type) {
        updates.support_type = editForm.support_type;
        roleChanged = true;
      }

      if (Object.keys(updates).length === 0) {
        cancelEditing();
        return;
      }

      const { error } = await supabase
        .from('support_staff')
        .update(updates)
        .eq('id', member.id);

      if (error) throw error;

      // Handle role change
      if (roleChanged) {

        const oldRole = roleForSupportType(member.support_type);
        const newRole = roleForSupportType(editForm.support_type);

        if (oldRole && oldRole !== newRole) {
          await revokeRole(member.user_id, oldRole);
        }
        if (newRole) {
          await assignRole(member.user_id, newRole);
        }
      }

      toast.success('Staff details updated');
      cancelEditing();
      fetchStaff();
    } catch (err) {
      console.error('Error saving edit:', err);
      toast.error('Failed to update staff details');
    }
  };

  // Transfer handler
  const handleTransfer = async () => {
    if (!transferTarget || !transferCity || !transferRegion) return;

    setIsTransferring(true);
    try {
      const { error } = await supabase
        .from('support_staff')
        .update({
          assigned_city: transferCity,
          assigned_region: transferRegion,
        })
        .eq('id', transferTarget.id);

      if (error) throw error;

      // Log the transfer in role_audit_log
      await supabase.from('role_audit_log').insert([{
        action: 'city_transfer',
        target_user_id: transferTarget.user_id,
        notes: `Transferred from ${transferTarget.assigned_city}, ${transferTarget.assigned_region} to ${transferCity}, ${transferRegion} (${getTypeLabel(transferTarget.support_type)})`,
      }]);

      toast.success(`${transferTarget.profile?.full_name || 'Staff'} transferred to ${transferCity}`);
      setTransferTarget(null);
      setTransferCity('');
      setTransferRegion('');
      fetchStaff();
    } catch (err) {
      console.error('Error transferring staff:', err);
      toast.error('Failed to transfer staff');
    } finally {
      setIsTransferring(false);
    }
  };

  const filteredStaff = staff.filter(s => {
    const matchesSearch = !searchQuery || 
      s.profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.profile?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.assigned_city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || s.support_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getTypeIcon = (type: string) => {
    const found = SUPPORT_TYPES.find(t => t.value === type);
    return found?.icon || Users;
  };

  const getTypeLabel = (type: string) => {
    const found = SUPPORT_TYPES.find(t => t.value === type);
    return found?.label || type;
  };

  // City coverage data
  const getCoverageData = () => {
    const coverage: Record<string, Record<string, { total: number; active: number; types: Record<string, number> }>> = {};

    Object.entries(CITIES_BY_REGION).forEach(([region, cities]) => {
      coverage[region] = {};
      cities.forEach(city => {
        coverage[region][city] = { total: 0, active: 0, types: {} };
        SUPPORT_TYPES.forEach(t => {
          coverage[region][city].types[t.value] = 0;
        });
      });
    });

    staff.forEach(s => {
      const region = s.assigned_region;
      const city = s.assigned_city;
      if (coverage[region]?.[city]) {
        coverage[region][city].total++;
        if (s.is_active) {
          coverage[region][city].active++;
          if (coverage[region][city].types[s.support_type] !== undefined) {
            coverage[region][city].types[s.support_type]++;
          }
        }
      }
    });

    return coverage;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Support User Management
            </CardTitle>
            <CardDescription>
              Register, onboard, and manage support staff across all categories
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStaff}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Dialog open={isOnboardOpen} onOpenChange={setIsOnboardOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Onboard Existing User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Onboard Existing User</DialogTitle>
                  <DialogDescription>
                    Add an existing platform user as support staff
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>User Email *</Label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={onboardUser.email}
                      onChange={(e) => setOnboardUser(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Support Type *</Label>
                    <Select
                      value={onboardUser.supportType}
                      onValueChange={(value) => setOnboardUser(prev => ({ ...prev, supportType: value as SupportTaskType }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Region *</Label>
                      <Select
                        value={onboardUser.assignedRegion}
                        onValueChange={(value) => setOnboardUser(prev => ({ 
                          ...prev, 
                          assignedRegion: value,
                          assignedCity: '',
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(CITIES_BY_REGION).map(region => (
                            <SelectItem key={region} value={region}>{region}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>City *</Label>
                      <Select
                        value={onboardUser.assignedCity}
                        onValueChange={(value) => setOnboardUser(prev => ({ ...prev, assignedCity: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select city" />
                        </SelectTrigger>
                        <SelectContent>
                          {(CITIES_BY_REGION[onboardUser.assignedRegion] || []).map(city => (
                            <SelectItem key={city} value={city}>{city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone (Optional)</Label>
                    <PhoneNumberInput
                      value={onboardUser.phone}
                      onChange={(v) => setOnboardUser(prev => ({ ...prev, phone: v }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsOnboardOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleOnboardUser} disabled={isOnboarding}>
                    {isOnboarding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Onboard User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Register New User
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Register New Support User</DialogTitle>
                  <DialogDescription>
                    Create a new account and assign support role
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input
                      placeholder="John Doe"
                      value={newUser.fullName}
                      onChange={(e) => setNewUser(prev => ({ ...prev, fullName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      value={newUser.email}
                      onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password *</Label>
                    <PasswordInput
                      placeholder="Minimum 8 characters"
                      autoComplete="new-password"
                      value={newUser.password}
                      onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone (Optional)</Label>
                    <PhoneNumberInput
                      value={newUser.phone}
                      onChange={(v) => setNewUser(prev => ({ ...prev, phone: v }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Support Type *</Label>
                    <Select
                      value={newUser.supportType}
                      onValueChange={(value) => setNewUser(prev => ({ ...prev, supportType: value as SupportTaskType }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Region *</Label>
                      <Select
                        value={newUser.assignedRegion}
                        onValueChange={(value) => setNewUser(prev => ({ 
                          ...prev, 
                          assignedRegion: value,
                          assignedCity: '',
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(CITIES_BY_REGION).map(region => (
                            <SelectItem key={region} value={region}>{region}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>City *</Label>
                      <Select
                        value={newUser.assignedCity}
                        onValueChange={(value) => setNewUser(prev => ({ ...prev, assignedCity: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select city" />
                        </SelectTrigger>
                        <SelectContent>
                          {(CITIES_BY_REGION[newUser.assignedRegion] || []).map(city => (
                            <SelectItem key={city} value={city}>{city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsRegisterOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleRegisterUser} disabled={isRegistering}>
                    {isRegistering && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Register User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'staff' | 'coverage')}>
          <TabsList className="mb-4">
            <TabsTrigger value="staff" className="gap-2">
              <Users className="h-4 w-4" />
              Staff Directory
            </TabsTrigger>
            <TabsTrigger value="coverage" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              City Coverage
            </TabsTrigger>
          </TabsList>

          {/* ===== STAFF DIRECTORY TAB ===== */}
          <TabsContent value="staff">
            {/* Filters */}
            <div className="flex gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {SUPPORT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Staff Table */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No support staff found</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaff.map((member) => {
                      const TypeIcon = getTypeIcon(member.support_type);
                      const isEditing = editingId === member.id;

                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            {member.profile?.full_name || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-sm">{member.profile?.email || '-'}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Select
                                value={editForm.support_type}
                                onValueChange={(value) => setEditForm(prev => ({ ...prev, support_type: value }))}
                              >
                                <SelectTrigger className="w-[160px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SUPPORT_TYPES.map(type => (
                                    <SelectItem key={type.value} value={type.value}>
                                      {type.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <TypeIcon className="h-3 w-3" />
                                {getTypeLabel(member.support_type)}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Select
                                  value={editForm.assigned_region}
                                  onValueChange={(value) => setEditForm(prev => ({ ...prev, assigned_region: value, assigned_city: '' }))}
                                >
                                  <SelectTrigger className="w-[100px] h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.keys(CITIES_BY_REGION).map(region => (
                                      <SelectItem key={region} value={region}>{region}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={editForm.assigned_city}
                                  onValueChange={(value) => setEditForm(prev => ({ ...prev, assigned_city: value }))}
                                >
                                  <SelectTrigger className="w-[130px] h-8">
                                    <SelectValue placeholder="City" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(CITIES_BY_REGION[editForm.assigned_region] || []).map(city => (
                                      <SelectItem key={city} value={city}>{city}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                {member.assigned_city}, {member.assigned_region}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editForm.phone}
                                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                                className="w-[130px] h-8"
                                placeholder="Phone"
                              />
                            ) : (
                              <span className="text-sm text-muted-foreground">{member.phone || '-'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={member.is_active}
                                onCheckedChange={() => handleToggleActive(member.id, member.is_active)}
                              />
                              {member.is_active ? (
                                <Badge variant="default" className="bg-green-500">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(member.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {isEditing ? (
                                <>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveEditing(member)}>
                                    <Save className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEditing}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(member)}>
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Edit details</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => {
                                            setTransferTarget(member);
                                            setTransferRegion(member.assigned_region);
                                            setTransferCity('');
                                          }}
                                        >
                                          <ArrowRightLeft className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Transfer to another city</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => handleRemoveStaff(member.id, member.user_id, member.support_type)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ===== CITY COVERAGE TAB ===== */}
          <TabsContent value="coverage">
            <CoverageOverview coverageData={getCoverageData()} />
          </TabsContent>
        </Tabs>

        {/* Stats Summary */}
        <div className="grid grid-cols-5 gap-4 mt-6 pt-4 border-t">
          {SUPPORT_TYPES.map(type => {
            const count = staff.filter(s => s.support_type === type.value && s.is_active).length;
            const TypeIcon = type.icon;
            return (
              <div key={type.value} className="text-center p-3 rounded-lg bg-muted/50">
                <TypeIcon className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{type.label}</p>
              </div>
            );
          })}
        </div>

        {/* Transfer Dialog */}
        <Dialog open={!!transferTarget} onOpenChange={(open) => !open && setTransferTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Transfer Staff Member
              </DialogTitle>
              <DialogDescription>
                Transfer <strong>{transferTarget?.profile?.full_name}</strong> from{' '}
                <strong>{transferTarget?.assigned_city}, {transferTarget?.assigned_region}</strong> to a new city.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p><strong>Current:</strong> {transferTarget?.assigned_city}, {transferTarget?.assigned_region}</p>
                <p><strong>Role:</strong> {getTypeLabel(transferTarget?.support_type || '')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Region</Label>
                  <Select value={transferRegion} onValueChange={(v) => { setTransferRegion(v); setTransferCity(''); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(CITIES_BY_REGION).map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>New City</Label>
                  <Select value={transferCity} onValueChange={setTransferCity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {(CITIES_BY_REGION[transferRegion] || []).map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferTarget(null)}>Cancel</Button>
              <Button onClick={handleTransfer} disabled={isTransferring || !transferCity}>
                {isTransferring && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Transfer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

// ===== City Coverage Overview Component =====
interface CoverageData {
  [region: string]: {
    [city: string]: {
      total: number;
      active: number;
      types: Record<string, number>;
    };
  };
}

const SUPPORT_TYPE_LABELS: Record<string, { label: string; short: string }> = {
  legal: { label: 'Legal', short: 'LGL' },
  iot_installation: { label: 'IoT Install', short: 'IoT-I' },
  iot_maintenance: { label: 'IoT Maint.', short: 'IoT-M' },
  vehicle_recall: { label: 'Veh. Recall', short: 'VR' },
  vehicle_maintenance: { label: 'Veh. Maint.', short: 'VM' },
};

const CoverageOverview = ({ coverageData }: { coverageData: CoverageData }) => {
  return (
    <div className="space-y-6">
      {Object.entries(coverageData).map(([region, cities]) => {
        const regionTotal = Object.values(cities).reduce((sum, c) => sum + c.active, 0);

        return (
          <div key={region}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                {region}
              </h3>
              <Badge variant="secondary">{regionTotal} active staff</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(cities).map(([city, data]) => {
                const hasGaps = Object.values(data.types).some(count => count === 0);
                const isEmpty = data.active === 0;

                return (
                  <div
                    key={city}
                    className={`p-4 rounded-lg border ${
                      isEmpty ? 'border-destructive/50 bg-destructive/5' :
                      hasGaps ? 'border-yellow-500/50 bg-yellow-500/5' :
                      'border-green-500/50 bg-green-500/5'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{city}</h4>
                      <div className="flex items-center gap-1">
                        {isEmpty && <AlertTriangle className="h-4 w-4 text-destructive" />}
                        {hasGaps && !isEmpty && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                        {!hasGaps && !isEmpty && <CheckCircle className="h-4 w-4 text-green-500" />}
                        <span className="text-sm font-medium">{data.active}/{data.total}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(data.types).map(([type, count]) => (
                        <TooltipProvider key={type}>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge
                                variant={count > 0 ? 'default' : 'outline'}
                                className={`text-xs ${count === 0 ? 'opacity-50 border-dashed' : ''}`}
                              >
                                {SUPPORT_TYPE_LABELS[type]?.short || type}: {count}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {SUPPORT_TYPE_LABELS[type]?.label || type} — {count} active
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground pt-4 border-t">
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-green-500" />
          Full coverage
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-yellow-500" />
          Partial coverage (gaps)
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          No coverage
        </span>
      </div>
    </div>
  );
};
