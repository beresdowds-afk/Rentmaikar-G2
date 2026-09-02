import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Edit, Save, Car, CheckCircle, AlertCircle, Search, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  status: string;
  pickup_location: string | null;
  pickup_address: string | null;
  pickup_city: string | null;
  pickup_instructions: string | null;
  owner_id: string;
  owner_name?: string;
  owner_email?: string;
}

const citySuggestions = [
  'Baltimore', 'Washington DC', 'Arlington', 'Alexandria', 'Bethesda', 'Silver Spring', 'Rockville',
  'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu'
];

const val = (v?: string | null) => (v ?? '').trim();

/** A pickup point is only usable by a driver when there is a real street address AND a city. */
const missingFields = (vehicle: Vehicle) => {
  const missing: string[] = [];
  if (!val(vehicle.pickup_address)) missing.push('street address');
  if (!val(vehicle.pickup_city)) missing.push('city');
  if (!val(vehicle.pickup_location)) missing.push('location name');
  // A location name that merely repeats the city carries no routing information.
  else if (val(vehicle.pickup_location).toLowerCase() === val(vehicle.pickup_city).toLowerCase())
    missing.push('location name (currently duplicates the city)');
  return missing;
};

type Completeness = 'complete' | 'partial' | 'empty';

const completenessOf = (vehicle: Vehicle): Completeness => {
  const missing = missingFields(vehicle);
  if (missing.length === 0) return 'complete';
  const hasAny = val(vehicle.pickup_location) || val(vehicle.pickup_address) || val(vehicle.pickup_city);
  return hasAny ? 'partial' : 'empty';
};


export function VehiclePickupManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'configured' | 'partial' | 'not-configured'>('all');
  const [formData, setFormData] = useState({
    pickup_location: '',
    pickup_address: '',
    pickup_city: '',
    pickup_instructions: '',
  });

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      // Fetch vehicles with owner profiles
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: false });

      if (vehiclesError) throw vehiclesError;

      // Fetch owner profiles
      const ownerIds = [...new Set(vehiclesData?.map(v => v.owner_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', ownerIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const vehiclesWithOwners = vehiclesData?.map(v => ({
        ...v,
        owner_name: profileMap.get(v.owner_id)?.full_name || 'Unknown',
        owner_email: profileMap.get(v.owner_id)?.email || '',
      })) || [];

      setVehicles(vehiclesWithOwners);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      toast.error('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      pickup_location: vehicle.pickup_location || '',
      pickup_address: vehicle.pickup_address || '',
      pickup_city: vehicle.pickup_city || '',
      pickup_instructions: vehicle.pickup_instructions || '',
    });
  };

  const handleSave = async () => {
    if (!editingVehicle) return;

    const address = formData.pickup_address.trim();
    const city = formData.pickup_city.trim();
    const location = formData.pickup_location.trim();
    if (!address || !city || !location) {
      toast.error('Location name, city and full street address are all required.');
      return;
    }
    if (location.toLowerCase() === city.toLowerCase()) {
      toast.error('Location name must be a landmark or spot — not just the city name.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({
          pickup_location: location,
          pickup_address: address,
          pickup_city: city,
          pickup_instructions: formData.pickup_instructions.trim() || null,
        })
        .eq('id', editingVehicle.id);

      if (error) throw error;

      toast.success('Pickup location updated successfully');
      setEditingVehicle(null);
      fetchVehicles();
    } catch (error) {
      console.error('Error updating pickup location:', error);
      toast.error('Failed to update pickup location');
    } finally {
      setSaving(false);
    }
  };

  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = 
      vehicle.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.license_plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.owner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.pickup_city?.toLowerCase().includes(searchQuery.toLowerCase());

    const state = completenessOf(vehicle);
    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'configured' && state === 'complete') ||
      (filterStatus === 'partial' && state === 'partial') ||
      (filterStatus === 'not-configured' && state === 'empty');

    return matchesSearch && matchesFilter;
  });

  const configuredCount = vehicles.filter((v) => completenessOf(v) === 'complete').length;
  const partialCount = vehicles.filter((v) => completenessOf(v) === 'partial').length;
  const notConfiguredCount = vehicles.filter((v) => completenessOf(v) === 'empty').length;


  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Vehicle Pickup Location Management
          </CardTitle>
          <CardDescription>
            Manage pickup locations for all vehicles in the fleet. These details are shared with drivers after agreement signing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{vehicles.length}</p>
              <p className="text-sm text-muted-foreground">Total Vehicles</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-600">{configuredCount}</p>
              <p className="text-sm text-muted-foreground">Fully Configured</p>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-amber-600">{partialCount}</p>
              <p className="text-sm text-muted-foreground">Incomplete</p>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-orange-600">{notConfiguredCount}</p>
              <p className="text-sm text-muted-foreground">Nothing Set</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-6">
            A vehicle counts as configured only when it has a distinct location name, a city and a full street address.
            A city on its own is not enough to route a driver.
          </p>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by vehicle, plate, owner, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={(value: 'all' | 'configured' | 'partial' | 'not-configured') => setFilterStatus(value)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                <SelectItem value="configured">Fully Configured</SelectItem>
                <SelectItem value="partial">Incomplete</SelectItem>
                <SelectItem value="not-configured">Nothing Set</SelectItem>
              </SelectContent>
            </Select>
          </div>


          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Pickup Location</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No vehicles found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center">
                            <Car className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{vehicle.make} {vehicle.model}</p>
                            <p className="text-sm text-muted-foreground">{vehicle.license_plate} • {vehicle.year}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{vehicle.owner_name}</p>
                          <p className="text-sm text-muted-foreground">{vehicle.owner_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {val(vehicle.pickup_address) || val(vehicle.pickup_location) ? (
                          <div>
                            <p className="font-medium">{val(vehicle.pickup_location) || '—'}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {val(vehicle.pickup_address) || 'No street address'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {vehicle.pickup_city || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {completenessOf(vehicle) === 'complete' ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Configured
                          </Badge>
                        ) : completenessOf(vehicle) === 'partial' ? (
                          <div className="space-y-1">
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Incomplete
                            </Badge>
                            <p className="text-xs text-muted-foreground max-w-[180px]">
                              Missing {missingFields(vehicle).join(', ')}
                            </p>
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Not Set
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(vehicle)}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingVehicle} onOpenChange={(open) => !open && setEditingVehicle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Pickup Location</DialogTitle>
            <DialogDescription>
              {editingVehicle && (
                <>
                  {editingVehicle.make} {editingVehicle.model} ({editingVehicle.year}) - {editingVehicle.license_plate}
                  <br />
                  <span className="text-muted-foreground">Owner: {editingVehicle.owner_name}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Location Name / Landmark</Label>
              <Input 
                placeholder="e.g. Downtown Office, Airport Area, Main Street"
                value={formData.pickup_location}
                onChange={(e) => setFormData(prev => ({ ...prev, pickup_location: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">A recognizable name or landmark near the pickup point</p>
            </div>
            
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                list="pickup-city-suggestions"
                placeholder="Start typing a city"
                value={formData.pickup_city}
                onChange={(e) => setFormData(prev => ({ ...prev, pickup_city: e.target.value }))}
              />
              <datalist id="pickup-city-suggestions">
                {citySuggestions.map(city => (
                  <option key={city} value={city} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">Free text — suggestions are only a shortcut.</p>
            </div>

            
            <div className="space-y-2">
              <Label>Full Address</Label>
              <Input 
                placeholder="Enter the full street address"
                value={formData.pickup_address}
                onChange={(e) => setFormData(prev => ({ ...prev, pickup_address: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Special Instructions (Optional)</Label>
              <Textarea 
                placeholder="e.g. Park in visitor spot #5, call when arrived, bring valid ID..."
                value={formData.pickup_instructions}
                onChange={(e) => setFormData(prev => ({ ...prev, pickup_instructions: e.target.value }))}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Any special instructions for the driver when picking up the vehicle</p>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setEditingVehicle(null)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Location
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
