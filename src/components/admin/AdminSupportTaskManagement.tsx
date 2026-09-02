import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SupportTaskVerificationQueue } from '@/components/admin/SupportTaskVerificationQueue';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  Plus, 
  Scale, 
  Cpu, 
  Car, 
  Users, 
  MapPin, 
  Search,
  Loader2,
  UserPlus,
  Trash2,
  RefreshCw,
  Shield,
  History,
} from 'lucide-react';
import { 
  LEGAL_STATUS_CONFIG, 
  IOT_STATUS_CONFIG, 
  VEHICLE_STATUS_CONFIG,
  INSURANCE_STATUS_CONFIG,
  PRIORITY_CONFIG,
  CITIES_BY_REGION,
  type SupportTaskType,
  type TaskPriority,
} from '@/types/support';
import TaskActivityLog from './TaskActivityLog';

interface SupportStaffMember {
  id: string;
  user_id: string;
  support_type: string;
  assigned_city: string;
  assigned_region: string;
  is_active: boolean;
  phone?: string;
  created_at: string;
  profile?: {
    full_name: string;
    email: string;
  };
}

interface SupportTaskRow {
  id: string;
  task_type: string;
  title: string;
  priority: string;
  city: string;
  region: string;
  legal_status?: string;
  iot_status?: string;
  vehicle_status?: string;
  insurance_status?: string;
  verification_state?: string;
  staff_feedback?: string;
  staff_resolved_at?: string;
  assigned_to?: string;
  vehicle_id?: string;
  device_id?: string;
  created_at: string;
  assigned_staff?: {
    id: string;
    profile?: {
      full_name: string;
    };
  };
  vehicle?: {
    make: string;
    model: string;
    year: number;
    license_plate: string;
  };
  device?: {
    serial_number: string;
    device_model: string;
  };
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  status: string;
}

interface IoTDevice {
  id: string;
  serial_number: string;
  device_model: string;
  status: string;
  is_linked: boolean;
  vehicle_id?: string;
}

const TASK_TYPE_OPTIONS: { value: SupportTaskType; label: string; icon: typeof Scale }[] = [
  { value: 'legal', label: 'Legal', icon: Scale },
  { value: 'iot_installation', label: 'IoT Installation', icon: Cpu },
  { value: 'iot_maintenance', label: 'IoT Maintenance', icon: Cpu },
  { value: 'vehicle_recall', label: 'Vehicle Recall', icon: Car },
  { value: 'vehicle_maintenance', label: 'Vehicle Maintenance', icon: Car },
  { value: 'insurance', label: 'Insurance Support', icon: Shield },
];

export const AdminSupportTaskManagement = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'tasks' | 'staff' | 'activity'>('tasks');
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<SupportTaskRow[]>([]);
  const [staff, setStaff] = useState<SupportStaffMember[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Create task form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTask, setNewTask] = useState({
    task_type: '' as SupportTaskType,
    title: '',
    description: '',
    priority: 'medium' as TaskPriority,
    city: '',
    region: 'Nigeria',
    assigned_to: '',
    location_address: '',
    scheduled_date: '',
    vehicle_id: '',
    device_id: '',
  });

  // Add staff form state
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({
    user_email: '',
    support_type: '' as SupportTaskType,
    assigned_city: '',
    assigned_region: 'Nigeria',
    phone: '',
  });

  // Fetch data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch tasks with joined vehicles and devices
      const { data: tasksData, error: tasksError } = await supabase
        .from('support_tasks')
        .select(`
          *,
          vehicles (
            make,
            model,
            year,
            license_plate
          ),
          iot_devices (
            serial_number,
            device_model
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (tasksError) throw tasksError;
      
      const formattedTasks = (tasksData || []).map((task: any) => ({
        ...task,
        vehicle: task.vehicles,
        device: task.iot_devices,
      }));
      setTasks(formattedTasks as SupportTaskRow[]);

      // Fetch staff with profiles
      const { data: staffData, error: staffError } = await supabase
        .from('support_staff')
        .select(`
          *,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (staffError) throw staffError;
      
      const formattedStaff = (staffData || []).map((s: any) => ({
        ...s,
        profile: s.profiles,
      }));
      setStaff(formattedStaff as SupportStaffMember[]);

      // Fetch vehicles
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id, make, model, year, license_plate, status')
        .order('created_at', { ascending: false });

      if (vehiclesError) throw vehiclesError;
      setVehicles((vehiclesData || []) as Vehicle[]);

      // Fetch IoT devices
      const { data: devicesData, error: devicesError } = await supabase
        .from('iot_devices')
        .select('id, serial_number, device_model, status, is_linked, vehicle_id')
        .order('created_at', { ascending: false });

      if (devicesError) throw devicesError;
      setDevices((devicesData || []) as IoTDevice[]);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Send task assignment notification
  const sendTaskNotification = async (
    staffId: string,
    taskTitle: string,
    taskType: string,
    priority: string,
    city: string,
    scheduledDate?: string,
    locationAddress?: string
  ) => {
    try {
      // Find staff member details
      const staffMember = staff.find(s => s.id === staffId);
      if (!staffMember?.profile?.email) {
        console.log('No email found for staff member');
        return;
      }

      const response = await supabase.functions.invoke('send-task-notification', {
        body: {
          staffEmail: staffMember.profile.email,
          staffName: staffMember.profile.full_name || 'Team Member',
          staffPhone: staffMember.phone,
          taskTitle,
          taskType,
          priority,
          city,
          scheduledDate,
          locationAddress,
        },
      });

      if (response.error) {
        console.error('Notification error:', response.error);
      } else {
        console.log('Notification sent successfully');
      }
    } catch (err) {
      console.error('Failed to send notification:', err);
    }
  };

  // Create new task
  const handleCreateTask = async () => {
    if (!newTask.task_type || !newTask.title || !newTask.city) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsCreating(true);
    try {
      // Determine initial status based on task type
      const statusField = newTask.task_type === 'legal' ? 'legal_status'
        : newTask.task_type === 'insurance' ? 'insurance_status'
        : newTask.task_type.startsWith('iot_') ? 'iot_status'
        : 'vehicle_status';

      const initialStatus = newTask.task_type === 'legal' ? 'open'
        : newTask.task_type === 'insurance' ? 'open'
        : newTask.task_type.startsWith('iot_') ? 'assigned'
        : 'reported';

      const { error } = await supabase
        .from('support_tasks')
        .insert([{
          task_type: newTask.task_type,
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          city: newTask.city,
          region: newTask.region,
          assigned_to: newTask.assigned_to || null,
          assigned_by: user?.id,
          assigned_at: newTask.assigned_to ? new Date().toISOString() : null,
          location_address: newTask.location_address || null,
          scheduled_date: newTask.scheduled_date || null,
          vehicle_id: newTask.vehicle_id || null,
          device_id: newTask.device_id || null,
          [statusField]: initialStatus,
        }]);

      if (error) throw error;

      // Send notification if task is assigned
      if (newTask.assigned_to) {
        await sendTaskNotification(
          newTask.assigned_to,
          newTask.title,
          newTask.task_type,
          newTask.priority,
          newTask.city,
          newTask.scheduled_date,
          newTask.location_address
        );
      }

      toast.success('Task created successfully');
      setIsCreateOpen(false);
      setNewTask({
        task_type: '' as SupportTaskType,
        title: '',
        description: '',
        priority: 'medium',
        city: '',
        region: 'Nigeria',
        assigned_to: '',
        location_address: '',
        scheduled_date: '',
        vehicle_id: '',
        device_id: '',
      });
      fetchData();
    } catch (err) {
      console.error('Error creating task:', err);
      toast.error('Failed to create task');
    } finally {
      setIsCreating(false);
    }
  };

  // Add new staff member
  const handleAddStaff = async () => {
    if (!newStaff.user_email || !newStaff.support_type || !newStaff.assigned_city) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsAddingStaff(true);
    try {
      // Find user by email
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, email')
        .eq('email', newStaff.user_email)
        .maybeSingle();

      if (profileError || !profileData) {
        toast.error('User not found with that email');
        setIsAddingStaff(false);
        return;
      }

      // Add to support_staff
      const { error: staffError } = await supabase
        .from('support_staff')
        .insert([{
          user_id: profileData.user_id,
          support_type: newStaff.support_type,
          assigned_city: newStaff.assigned_city,
          assigned_region: newStaff.assigned_region,
          phone: newStaff.phone || null,
          is_active: true,
        }]);

      if (staffError) throw staffError;

      // Add role to user_roles
      type SupportRole = 'legal_support' | 'iot_support' | 'vehicle_support' | 'insurance_support';
      const roleMap: Record<string, SupportRole> = {
        'legal': 'legal_support',
        'iot_installation': 'iot_support',
        'iot_maintenance': 'iot_support',
        'vehicle_recall': 'vehicle_support',
        'vehicle_maintenance': 'vehicle_support',
        'insurance': 'insurance_support',
      };

      const role = roleMap[newStaff.support_type];
      if (role) {
        await supabase
          .from('user_roles')
          .insert([{
            user_id: profileData.user_id,
            role: role,
          }]);
      }

      toast.success('Staff member added successfully');
      setIsAddStaffOpen(false);
      setNewStaff({
        user_email: '',
        support_type: '' as SupportTaskType,
        assigned_city: '',
        assigned_region: 'Nigeria',
        phone: '',
      });
      fetchData();
    } catch (err) {
      console.error('Error adding staff:', err);
      toast.error('Failed to add staff member');
    } finally {
      setIsAddingStaff(false);
    }
  };

  // Delete staff
  const handleDeleteStaff = async (staffId: string) => {
    if (!confirm('Are you sure you want to remove this staff member?')) return;

    try {
      const { error } = await supabase
        .from('support_staff')
        .delete()
        .eq('id', staffId);

      if (error) throw error;
      toast.success('Staff member removed');
      fetchData();
    } catch (err) {
      console.error('Error deleting staff:', err);
      toast.error('Failed to remove staff member');
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = !searchQuery || 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.vehicle?.license_plate?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.device?.serial_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || task.task_type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Get status for display
  const getTaskStatus = (task: SupportTaskRow) => {
    if (task.legal_status) return LEGAL_STATUS_CONFIG[task.legal_status as keyof typeof LEGAL_STATUS_CONFIG];
    if (task.iot_status) return IOT_STATUS_CONFIG[task.iot_status as keyof typeof IOT_STATUS_CONFIG];
    if (task.vehicle_status) return VEHICLE_STATUS_CONFIG[task.vehicle_status as keyof typeof VEHICLE_STATUS_CONFIG];
    if (task.insurance_status) return INSURANCE_STATUS_CONFIG[task.insurance_status as keyof typeof INSURANCE_STATUS_CONFIG];
    return { label: 'Unknown', color: 'bg-gray-500' };
  };

  // Get available staff for assignment
  const getAvailableStaff = (taskType: SupportTaskType, city: string) => {
    return staff.filter(s => {
      const typeMatch = s.support_type === taskType || 
        (taskType.startsWith('iot_') && s.support_type.startsWith('iot_')) ||
        (taskType.startsWith('vehicle_') && s.support_type.startsWith('vehicle_'));
      return typeMatch && s.assigned_city === city && s.is_active;
    });
  };

  // Check if task type needs vehicle selection
  const needsVehicle = (taskType: string) => {
    return ['vehicle_recall', 'vehicle_maintenance', 'iot_installation', 'iot_maintenance'].includes(taskType);
  };

  // Check if task type needs device selection
  const needsDevice = (taskType: string) => {
    return ['iot_installation', 'iot_maintenance'].includes(taskType);
  };

  // Get filtered devices based on selected vehicle
  const getFilteredDevices = () => {
    if (newTask.vehicle_id) {
      return devices.filter(d => d.vehicle_id === newTask.vehicle_id || !d.is_linked);
    }
    return devices;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Support Task Management
            </CardTitle>
            <CardDescription>
              Create and assign tasks to support staff across cities
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tasks' | 'staff' | 'activity')}>
          <TabsList className="mb-4">
            <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
            <TabsTrigger value="staff">Staff ({staff.length})</TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <History className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
            <SupportTaskVerificationQueue />

            {/* Filters and Create Button */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks, vehicles, devices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Task type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TASK_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Task
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Support Task</DialogTitle>
                    <DialogDescription>
                      Assign a new task to support staff in a specific city
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Task Type *</Label>
                        <Select 
                          value={newTask.task_type} 
                          onValueChange={(v) => setNewTask(prev => ({ 
                            ...prev, 
                            task_type: v as SupportTaskType,
                            vehicle_id: '',
                            device_id: '',
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_TYPE_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  <opt.icon className="h-4 w-4" />
                                  {opt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Priority *</Label>
                        <Select 
                          value={newTask.priority} 
                          onValueChange={(v) => setNewTask(prev => ({ ...prev, priority: v as TaskPriority }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PRIORITY_CONFIG).map(([key, val]) => (
                              <SelectItem key={key} value={key}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${val.color}`} />
                                  {val.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Title *</Label>
                      <Input
                        placeholder="Task title..."
                        value={newTask.title}
                        onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Detailed description..."
                        value={newTask.description}
                        onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    <Separator />

                    {/* Vehicle Selection */}
                    {needsVehicle(newTask.task_type) && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Car className="h-4 w-4" />
                          Vehicle
                        </Label>
                        <Select 
                          value={newTask.vehicle_id} 
                          onValueChange={(v) => setNewTask(prev => ({ ...prev, vehicle_id: v, device_id: '' }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select vehicle (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No vehicle selected</SelectItem>
                            {vehicles.map(vehicle => (
                              <SelectItem key={vehicle.id} value={vehicle.id}>
                                {vehicle.year} {vehicle.make} {vehicle.model} - {vehicle.license_plate}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {vehicles.length === 0 && (
                          <p className="text-xs text-muted-foreground">No vehicles registered yet</p>
                        )}
                      </div>
                    )}

                    {/* Device Selection */}
                    {needsDevice(newTask.task_type) && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Cpu className="h-4 w-4" />
                          IoT Device
                        </Label>
                        <Select 
                          value={newTask.device_id} 
                          onValueChange={(v) => setNewTask(prev => ({ ...prev, device_id: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select device (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No device selected</SelectItem>
                            {getFilteredDevices().map(device => (
                              <SelectItem key={device.id} value={device.id}>
                                {device.serial_number} ({device.device_model}) 
                                {device.is_linked ? ' - Linked' : ' - Not Linked'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {devices.length === 0 && (
                          <p className="text-xs text-muted-foreground">No IoT devices registered yet</p>
                        )}
                      </div>
                    )}

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Region *</Label>
                        <Select 
                          value={newTask.region} 
                          onValueChange={(v) => setNewTask(prev => ({ ...prev, region: v, city: '' }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Nigeria">Nigeria</SelectItem>
                            <SelectItem value="USA">USA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>City *</Label>
                        <Select 
                          value={newTask.city} 
                          onValueChange={(v) => setNewTask(prev => ({ ...prev, city: v, assigned_to: '' }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select city" />
                          </SelectTrigger>
                          <SelectContent>
                            {(CITIES_BY_REGION[newTask.region] || []).map(city => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {newTask.task_type && newTask.city && (
                      <div className="space-y-2">
                        <Label>Assign To (Optional)</Label>
                        <Select 
                          value={newTask.assigned_to} 
                          onValueChange={(v) => setNewTask(prev => ({ ...prev, assigned_to: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select staff member" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Unassigned</SelectItem>
                            {getAvailableStaff(newTask.task_type, newTask.city).map(s => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.profile?.full_name || s.profile?.email || s.id.slice(0, 8)}
                                {' '}({s.support_type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {getAvailableStaff(newTask.task_type, newTask.city).length === 0 && (
                          <p className="text-xs text-muted-foreground">No staff available for this type/city combination</p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Location Address</Label>
                      <Input
                        placeholder="Street address..."
                        value={newTask.location_address}
                        onChange={(e) => setNewTask(prev => ({ ...prev, location_address: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Scheduled Date</Label>
                      <Input
                        type="date"
                        value={newTask.scheduled_date}
                        onChange={(e) => setNewTask(prev => ({ ...prev, scheduled_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTask} disabled={isCreating}>
                      {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Task
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Tasks Table */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Vehicle/Device</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : filteredTasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No tasks found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTasks.map(task => {
                      const status = getTaskStatus(task);
                      const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG];
                      return (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {task.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {TASK_TYPE_OPTIONS.find(t => t.value === task.task_type)?.label || task.task_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {task.vehicle && (
                              <div className="flex items-center gap-1">
                                <Car className="h-3 w-3" />
                                <span className="truncate max-w-[100px]">
                                  {task.vehicle.license_plate}
                                </span>
                              </div>
                            )}
                            {task.device && (
                              <div className="flex items-center gap-1">
                                <Cpu className="h-3 w-3" />
                                <span className="truncate max-w-[100px]">
                                  {task.device.serial_number}
                                </span>
                              </div>
                            )}
                            {!task.vehicle && !task.device && (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {task.city}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${priority?.color || 'bg-gray-500'} text-white`}>
                              {priority?.label || task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${status.color} text-white`}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(task.created_at), 'MMM d, yyyy')}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          {/* Staff Tab */}
          <TabsContent value="staff" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add Staff Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Support Staff</DialogTitle>
                    <DialogDescription>
                      Assign a user to a support role in a specific city
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>User Email *</Label>
                      <Input
                        type="email"
                        placeholder="user@example.com"
                        value={newStaff.user_email}
                        onChange={(e) => setNewStaff(prev => ({ ...prev, user_email: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Support Type *</Label>
                      <Select 
                        value={newStaff.support_type} 
                        onValueChange={(v) => setNewStaff(prev => ({ ...prev, support_type: v as SupportTaskType }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_TYPE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Region *</Label>
                        <Select 
                          value={newStaff.assigned_region} 
                          onValueChange={(v) => setNewStaff(prev => ({ ...prev, assigned_region: v, assigned_city: '' }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Nigeria">Nigeria</SelectItem>
                            <SelectItem value="USA">USA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>City *</Label>
                        <Select 
                          value={newStaff.assigned_city} 
                          onValueChange={(v) => setNewStaff(prev => ({ ...prev, assigned_city: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select city" />
                          </SelectTrigger>
                          <SelectContent>
                            {(CITIES_BY_REGION[newStaff.assigned_region] || []).map(city => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Phone (Optional)</Label>
                      <PhoneNumberInput
                        value={newStaff.phone}
                        onChange={(v) => setNewStaff(prev => ({ ...prev, phone: v }))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setIsAddStaffOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddStaff} disabled={isAddingStaff}>
                      {isAddingStaff && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Staff
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Staff Table */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : staff.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No staff members found
                      </TableCell>
                    </TableRow>
                  ) : (
                    staff.map(member => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.profile?.full_name || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {member.profile?.email || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {TASK_TYPE_OPTIONS.find(t => t.value === member.support_type)?.label || member.support_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {member.assigned_city}
                          </div>
                        </TableCell>
                        <TableCell>{member.assigned_region}</TableCell>
                        <TableCell>
                          <Badge variant={member.is_active ? 'default' : 'secondary'}>
                            {member.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(member.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteStaff(member.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <TaskActivityLog />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AdminSupportTaskManagement;
