import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Car, Loader2 } from 'lucide-react';
import { DocumentUpload } from './DocumentUpload';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
}

export const VehicleDocumentUpload = () => {
  const { user } = useAuth();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  // Fetch owner's vehicles
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['owner-vehicles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, make, model, year, license_plate')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Vehicle[];
    },
    enabled: !!user,
  });

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const vehicleName = selectedVehicle 
    ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` 
    : undefined;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Vehicle Documents
          </CardTitle>
          <CardDescription>
            You haven't registered any vehicles yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Register a vehicle first to upload its documents.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Select Vehicle
          </CardTitle>
          <CardDescription>
            Choose a vehicle to manage its documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Vehicle</Label>
            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a vehicle..." />
              </SelectTrigger>
              <SelectContent>
                {vehicles.filter(v => v.id).map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedVehicleId && (
        <DocumentUpload 
          userType="owner" 
          vehicleId={selectedVehicleId} 
          vehicleName={vehicleName}
        />
      )}
    </div>
  );
};

export default VehicleDocumentUpload;
