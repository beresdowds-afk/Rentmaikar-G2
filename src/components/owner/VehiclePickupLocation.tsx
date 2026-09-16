import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Edit, Save, Car, CheckCircle, AlertCircle, Home } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { useQueryClient } from '@tanstack/react-query';
import { PublishVehicleButton } from './PublishVehicleButton';
import { toast } from 'sonner';
import { useRegionSamples } from '@/hooks/useRegionSamples';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  pickup_location: string | null;
  pickup_address: string | null;
  pickup_city: string | null;
  pickup_instructions: string | null;
  photo_urls?: string[] | null;
  is_public?: boolean | null;
  status?: string | null;
}

const usaCities = ['Baltimore', 'Washington DC', 'Arlington', 'Alexandria', 'Bethesda', 'Silver Spring', 'Rockville', 'Annapolis', 'Gaithersburg', 'Frederick', 'Towson'];
const nigeriaCities = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu', 'Benin City', 'Calabar', 'Kaduna', 'Asaba'];

export function VehiclePickupLocation() {
  const { user } = useAuth();
  const samples = useRegionSamples();
  const { country } = useRegion();
  const queryClient = useQueryClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    pickup_location: '',
    pickup_address: '',
    pickup_city: '',
    pickup_instructions: '',
  });
  const [ownerHomeAddress, setOwnerHomeAddress] = useState<string | null>(null);

  const cities = country === 'USA' ? usaCities : nigeriaCities;

  useEffect(() => {
    fetchVehicles();
    if (user?.id) {
      supabase
        .from('profiles')
        .select('street_address')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.street_address) {
            setOwnerHomeAddress(data.street_address);
          }
        });
    }
  }, [user]);

  const fetchVehicles = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, make, model, year, license_plate, pickup_location, pickup_address, pickup_city, pickup_instructions, photo_urls, is_public, status')
        .eq('owner_id', user.id);

      if (error) throw error;
      setVehicles(data || []);
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
    
    setSaving(true);
    try {
      const effectiveLocation = formData.pickup_location.trim() || formData.pickup_address.trim();
      const effectiveAddress = formData.pickup_address.trim() || formData.pickup_location.trim();

      const { error } = await supabase
        .from('vehicles')
        .update({
          pickup_location: effectiveLocation || null,
          pickup_address: effectiveAddress || null,
          pickup_city: formData.pickup_city.trim() || null,
          pickup_instructions: formData.pickup_instructions.trim() || null,
        } as never)
        .eq('id', editingVehicle.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['catalogue'] });

      window.dispatchEvent(new CustomEvent('rentmaikar:vehicle_authorization_updated'));

      toast.success('Pickup location updated successfully. This vehicle is now eligible for publishing.');
      setEditingVehicle(null);
      fetchVehicles();
    } catch (error) {
      console.error('Error updating pickup location:', error);
      toast.error('Failed to update pickup location');
    } finally {
      setSaving(false);
    }
  };

  const hasPickupDetails = (vehicle: Vehicle) => {
    return Boolean(vehicle.pickup_city && (vehicle.pickup_location || vehicle.pickup_address));
  };

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Vehicle Pickup Locations
        </CardTitle>
        <CardDescription>
          Set compulsory pickup and handover locations for your vehicles. Submitting this information is required to enable the Publish Vehicle button.
        </CardDescription>

        {/* Differentiation Callout */}
        <div className="mt-3 rounded-lg border border-border/80 bg-muted/40 p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Home className="h-4 w-4 text-primary" />
            <span>Owner Home Address vs. Vehicle Pickup Location</span>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            • <strong>Owner Home Address</strong>: Optional on your personal profile and kept private. Not compulsory for vehicle owners.
          </p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            • <strong>Vehicle Pickup Location</strong>: A strict requirement for each vehicle before it can be published on the public catalogue, so verified drivers know the exact collection point.
          </p>
          <p className="text-muted-foreground text-[11px] italic">
            They may have the same address if you store and hand over vehicles from your personal residence.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {vehicles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No vehicles found. Add a vehicle first to set pickup locations.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {vehicles.map((vehicle) => (
              <div 
                key={vehicle.id} 
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
                    <Car className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {vehicle.make} {vehicle.model} ({vehicle.year})
                    </p>
                    <p className="text-sm text-muted-foreground">{vehicle.license_plate}</p>
                    {hasPickupDetails(vehicle) ? (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                            {vehicle.pickup_city} {vehicle.pickup_address ? `• ${vehicle.pickup_address}` : vehicle.pickup_location ? `• ${vehicle.pickup_location}` : ''}
                          </span>
                        </div>
                        {ownerHomeAddress && vehicle.pickup_address?.trim() === ownerHomeAddress.trim() && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-300">
                            Same as Owner's Home
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1 text-amber-700 dark:text-amber-300">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span className="text-xs font-medium">
                          Pickup location not set (Required to enable Publish)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2.5 flex-wrap sm:justify-end">
                  <PublishVehicleButton
                    vehicle={vehicle as any}
                    onPublished={() => {
                      fetchVehicles();
                      queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] });
                    }}
                  />

                  <Dialog open={editingVehicle?.id === vehicle.id} onOpenChange={(open) => !open && setEditingVehicle(null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(vehicle)}>
                        <Edit className="h-4 w-4 mr-1" />
                        {hasPickupDetails(vehicle) ? 'Edit Location' : 'Set Location'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Set Vehicle Pickup Location</DialogTitle>
                        <DialogDescription>
                          {vehicle.make} {vehicle.model} ({vehicle.year}) - {vehicle.license_plate}
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4 mt-4">
                        {ownerHomeAddress ? (
                          <div className="flex items-center justify-between gap-2 p-2.5 bg-muted/60 rounded-lg border text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                              <Home className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="truncate">Saved home address: <strong>{ownerHomeAddress}</strong></span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setFormData(prev => ({ ...prev, pickup_address: ownerHomeAddress }))}
                              className="h-6 text-[11px] px-2 shrink-0 gap-1 text-primary border-primary/40 hover:bg-primary/10"
                            >
                              <Home className="h-3 w-3" />
                              Use as Pickup
                            </Button>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">
                            (Your personal home address is optional on your profile and not set. Enter this vehicle's physical pickup location below.)
                          </p>
                        )}

                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            Pickup City <span className="text-destructive font-bold">*</span>
                          </Label>
                          <Select 
                            value={formData.pickup_city} 
                            onValueChange={(value) => setFormData(prev => ({ ...prev, pickup_city: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select city..." />
                            </SelectTrigger>
                            <SelectContent>
                              {cities.map(city => (
                                <SelectItem key={city} value={city}>{city}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-1">
                              Full Street Address / Handover Point <span className="text-destructive font-bold">*</span>
                            </Label>
                            {ownerHomeAddress && formData.pickup_address.trim() === ownerHomeAddress.trim() && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Matches owner's home address
                              </span>
                            )}
                          </div>
                          <Input 
                            placeholder={`e.g. ${samples.address}`}
                            value={formData.pickup_address}
                            onChange={(e) => setFormData(prev => ({ ...prev, pickup_address: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Location Name / Landmark (Optional)</Label>
                          <Input 
                            placeholder={`e.g. ${samples.landmark}`}
                            value={formData.pickup_location}
                            onChange={(e) => setFormData(prev => ({ ...prev, pickup_location: e.target.value }))}
                          />
                          <p className="text-xs text-muted-foreground">A recognizable name or landmark near the pickup point</p>
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
                          <Button 
                            onClick={handleSave} 
                            disabled={saving || !formData.pickup_city.trim() || (!formData.pickup_address.trim() && !formData.pickup_location.trim())} 
                            className="flex-1"
                          >
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
