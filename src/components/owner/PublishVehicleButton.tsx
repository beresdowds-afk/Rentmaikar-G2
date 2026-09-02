import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, ShieldCheck, CheckCircle2, AlertCircle, Eye, MapPin } from 'lucide-react';
import { PublishVehicleModal } from './PublishVehicleModal';
import {
  getAuthorizationByVehicleId,
  type VehicleRentalAuthorization,
} from '@/services/vehicleAuthorizationService';

interface PublishVehicleButtonProps {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    license_plate: string;
    vin?: string | null;
    color?: string | null;
    pickup_city?: string | null;
    pickup_location?: string | null;
    pickup_address?: string | null;
    pickup_instructions?: string | null;
    photo_urls?: string[] | null;
    owner_id?: string;
    is_public?: boolean | null;
    status?: string | null;
  };
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  onPublished?: () => void;
}

export function PublishVehicleButton({
  vehicle,
  variant = 'default',
  size = 'sm',
  className = '',
  onPublished,
}: PublishVehicleButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [authRecord, setAuthRecord] = useState<VehicleRentalAuthorization | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAuth = async () => {
    try {
      const rec = await getAuthorizationByVehicleId(vehicle.id);
      setAuthRecord(rec);
    } catch (e) {
      console.warn('Could not load auth record for vehicle', vehicle.id, e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuth();

    const handleUpdate = () => {
      loadAuth();
    };

    window.addEventListener('rentmaikar:vehicle_authorization_updated', handleUpdate);
    return () => {
      window.removeEventListener('rentmaikar:vehicle_authorization_updated', handleUpdate);
    };
  }, [vehicle.id]);

  const isPublished = authRecord?.status === 'ACTIVE' || Boolean(vehicle.is_public);
  const hasPickupLocation = Boolean(
    vehicle.pickup_city &&
    (vehicle.pickup_address || vehicle.pickup_location)
  );

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {isPublished ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 gap-1 py-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              Published &amp; Authorized
            </Badge>
            <Button
              variant="outline"
              size={size}
              onClick={() => setModalOpen(true)}
              className="h-7 text-xs gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Manage Authorization
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant={variant}
              size={size}
              onClick={() => setModalOpen(true)}
              className={`gap-1.5 ${className}`}
            >
              <Globe className="w-3.5 h-3.5" />
              Publish Vehicle to Catalogue
            </Button>
            {!hasPickupLocation && (
              <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800 gap-1 py-0.5">
                <MapPin className="w-2.5 h-2.5" />
                Pickup Location Required
              </Badge>
            )}
          </div>
        )}
      </div>

      <PublishVehicleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        vehicle={vehicle}
        existingAuthorization={authRecord}
        onSuccess={() => {
          loadAuth();
          onPublished?.();
        }}
      />
    </>
  );
}

export default PublishVehicleButton;

