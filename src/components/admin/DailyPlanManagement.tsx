import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Ban, 
  CheckCircle, 
  Search, 
  Loader2, 
  Calendar,
  RefreshCw,
  AlertTriangle,
  Shield,
  User
} from 'lucide-react';

interface ForbiddenDriver {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  daily_plan_forbidden: boolean;
  daily_plan_forbidden_at: string | null;
  daily_plan_forbidden_reason: string | null;
}

export function DailyPlanManagement() {
  const [forbiddenDrivers, setForbiddenDrivers] = useState<ForbiddenDriver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<ForbiddenDriver | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  const fetchForbiddenDrivers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, phone, daily_plan_forbidden, daily_plan_forbidden_at, daily_plan_forbidden_reason')
        .eq('daily_plan_forbidden', true)
        .order('daily_plan_forbidden_at', { ascending: false });

      if (error) throw error;
      setForbiddenDrivers(data || []);
    } catch (error) {
      console.error('[DailyPlanManagement] Error fetching drivers:', error);
      toast.error('Failed to fetch forbidden drivers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchForbiddenDrivers();
  }, []);

  const handleRestoreEligibility = async () => {
    if (!selectedDriver) return;
    
    setIsRestoring(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          daily_plan_forbidden: false,
          daily_plan_forbidden_at: null,
          daily_plan_forbidden_reason: null,
        })
        .eq('user_id', selectedDriver.user_id);

      if (error) throw error;

      // Log the restoration action
      console.log('[DailyPlanManagement] Eligibility restored for:', {
        userId: selectedDriver.user_id,
        name: selectedDriver.full_name,
        restoreReason,
      });

      toast.success(`Daily plan eligibility restored for ${selectedDriver.full_name || selectedDriver.email}`);
      
      // Refresh the list
      setForbiddenDrivers(prev => prev.filter(d => d.user_id !== selectedDriver.user_id));
      setShowRestoreDialog(false);
      setSelectedDriver(null);
      setRestoreReason('');
    } catch (error) {
      console.error('[DailyPlanManagement] Error restoring eligibility:', error);
      toast.error('Failed to restore eligibility');
    } finally {
      setIsRestoring(false);
    }
  };

  const filteredDrivers = forbiddenDrivers.filter(driver => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      driver.full_name?.toLowerCase().includes(query) ||
      driver.email?.toLowerCase().includes(query) ||
      driver.phone?.includes(query)
    );
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Ban className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Daily Plan Eligibility Management</CardTitle>
              <CardDescription>
                Manage drivers who are forbidden from using daily payment plans due to payment defaults
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchForbiddenDrivers}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Info Alert */}
        <Alert className="bg-muted/50 border-muted">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Drivers are automatically forbidden from daily payment plans after a payment default. 
            Use this interface to manually restore eligibility for drivers who have resolved their defaults.
          </AlertDescription>
        </Alert>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="shrink-0">
            {filteredDrivers.length} forbidden
          </Badge>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h4 className="font-semibold text-lg">No Forbidden Drivers</h4>
            <p className="text-muted-foreground text-sm mt-1">
              {searchQuery 
                ? 'No drivers match your search criteria' 
                : 'All drivers are currently eligible for daily payment plans'}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Forbidden Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{driver.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{driver.user_id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm">{driver.email || 'No email'}</p>
                        <p className="text-xs text-muted-foreground">{driver.phone || 'No phone'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatDate(driver.daily_plan_forbidden_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {driver.daily_plan_forbidden_reason || 'Payment default'}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedDriver(driver);
                          setShowRestoreDialog(true);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Restore Dialog */}
        <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Restore Daily Plan Eligibility
              </DialogTitle>
              <DialogDescription>
                This will allow the driver to use daily payment plans again. Make sure their previous default has been resolved.
              </DialogDescription>
            </DialogHeader>

            {selectedDriver && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Driver:</span>
                    <span className="font-medium">{selectedDriver.full_name || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span>{selectedDriver.email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Forbidden Since:</span>
                    <span>{formatDate(selectedDriver.daily_plan_forbidden_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reason:</span>
                    <span className="text-sm">{selectedDriver.daily_plan_forbidden_reason || 'Payment default'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="restore-reason">Restoration Reason (optional)</Label>
                  <Textarea
                    id="restore-reason"
                    placeholder="e.g., Driver has paid all outstanding amounts and completed verification..."
                    value={restoreReason}
                    onChange={(e) => setRestoreReason(e.target.value)}
                    rows={3}
                  />
                </div>

                <Alert variant="destructive" className="bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    By restoring eligibility, the driver will be able to select daily payment plans. 
                    If they default again, they will be automatically forbidden once more.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowRestoreDialog(false);
                  setSelectedDriver(null);
                  setRestoreReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRestoreEligibility}
                disabled={isRestoring}
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Restore Eligibility
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
