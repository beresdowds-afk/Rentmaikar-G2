import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, CreditCard, AlertTriangle, Clock, CheckCircle, RefreshCw, DollarSign, Users, Ban, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface PaymentTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  city: string;
  region: string;
  driver_id: string | null;
  owner_id: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export const PaymentAccountsSupportDashboard = () => {
  const [paymentTasks, setPaymentTasks] = useState<PaymentTask[]>([]);
  const [paymentDefaults, setPaymentDefaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('disputes');
  const [filterRegion, setFilterRegion] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch payment-related support tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('support_tasks')
        .select('*')
        .eq('task_type', 'payment_accounts')
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;
      setPaymentTasks(tasksData || []);

      // Fetch payment defaults
      const { data: defaultsData, error: defaultsError } = await supabase
        .from('payment_defaults')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (defaultsError) throw defaultsError;
      setPaymentDefaults(defaultsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-destructive text-destructive-foreground',
      medium: 'bg-warning text-warning-foreground',
      low: 'bg-muted text-muted-foreground',
    };
    return <Badge className={colors[priority] || colors.medium}>{priority}</Badge>;
  };

  const getStatusBadge = (resolved: boolean) => {
    return resolved ? (
      <Badge className="bg-success text-success-foreground gap-1">
        <CheckCircle className="h-3 w-3" />
        Resolved
      </Badge>
    ) : (
      <Badge className="bg-amber-500 text-white gap-1">
        <Clock className="h-3 w-3" />
        Open
      </Badge>
    );
  };

  const filteredTasks = paymentTasks.filter(task => {
    if (filterRegion !== 'all' && task.region.toLowerCase() !== filterRegion) return false;
    return true;
  });

  const stats = {
    totalDisputes: paymentTasks.length,
    openDisputes: paymentTasks.filter(t => !t.resolved_at).length,
    activeDefaults: paymentDefaults.length,
    highPriority: paymentTasks.filter(t => t.priority === 'high' && !t.resolved_at).length,
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Disputes</p>
                <p className="text-2xl font-bold">{stats.totalDisputes}</p>
              </div>
              <CreditCard className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Disputes</p>
                <p className="text-2xl font-bold text-amber-500">{stats.openDisputes}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Defaults</p>
                <p className="text-2xl font-bold text-destructive">{stats.activeDefaults}</p>
              </div>
              <Ban className="h-8 w-8 text-destructive opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Priority</p>
                <p className="text-2xl font-bold text-warning">{stats.highPriority}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-warning opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Payment & Accounts Support
              </CardTitle>
              <CardDescription>
                Handle payment disputes, refunds, account issues, and billing inquiries
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={filterRegion} onValueChange={setFilterRegion}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="usa">USA</SelectItem>
                  <SelectItem value="nigeria">Nigeria</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="disputes" className="gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Disputes
              </TabsTrigger>
              <TabsTrigger value="defaults" className="gap-2">
                <Ban className="h-4 w-4" />
                Active Defaults
              </TabsTrigger>
              <TabsTrigger value="refunds" className="gap-2">
                <ArrowUpRight className="h-4 w-4" />
                Refund Requests
              </TabsTrigger>
              <TabsTrigger value="accounts" className="gap-2">
                <Users className="h-4 w-4" />
                Account Issues
              </TabsTrigger>
            </TabsList>

            <TabsContent value="disputes">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No payment disputes</p>
                  <p className="text-sm">Payment dispute cases will appear here</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(!!task.resolved_at)}</TableCell>
                        <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{task.city}</p>
                            <p className="text-xs text-muted-foreground">{task.region}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(task.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm">
                            <DollarSign className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="defaults">
              {paymentDefaults.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Ban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No active payment defaults</p>
                  <p className="text-sm">Active default cases will appear here</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver ID</TableHead>
                      <TableHead>Amount Due</TableHead>
                      <TableHead>Hours Overdue</TableHead>
                      <TableHead>Notifications</TableHead>
                      <TableHead>Deactivation</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentDefaults.map((def) => (
                      <TableRow key={def.id}>
                        <TableCell className="font-mono text-sm">{def.driver_id?.slice(0, 8)}...</TableCell>
                        <TableCell>
                          <span className="font-bold">
                            {def.currency === 'NGN' ? '₦' : '$'}
                            {Number(def.amount_due).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={def.hours_overdue > 48 ? 'destructive' : 'secondary'}>
                            {def.hours_overdue}h
                          </Badge>
                        </TableCell>
                        <TableCell>{def.notifications_sent} sent</TableCell>
                        <TableCell>
                          {def.deactivation_eligible ? (
                            <Badge variant="destructive">Eligible</Badge>
                          ) : (
                            <Badge variant="secondary">Not Yet</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm">
                            Contact Driver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="refunds">
              <div className="text-center py-12 text-muted-foreground">
                <ArrowUpRight className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No pending refund requests</p>
                <p className="text-sm">Refund requests will appear here when submitted</p>
              </div>
            </TabsContent>

            <TabsContent value="accounts">
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No account issues</p>
                <p className="text-sm">Account-related support tickets will appear here</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
