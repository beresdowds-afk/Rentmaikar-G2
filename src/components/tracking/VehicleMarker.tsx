import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { VehicleLocation } from '@/lib/mqtt-client';
import { Button } from '@/components/ui/button';
import { Power, Battery, Gauge, Navigation } from 'lucide-react';

interface VehicleMarkerProps {
  vehicle: VehicleLocation & { 
    make?: string; 
    model?: string; 
    licensePlate?: string;
    driverName?: string;
  };
  onDisable?: (vehicleId: string) => void;
  onEnable?: (vehicleId: string) => void;
}

// Create custom vehicle icon based on status
const createVehicleIcon = (isParked: boolean, ignitionStatus: boolean): L.DivIcon => {
  const color = !ignitionStatus ? '#ef4444' : isParked ? '#f59e0b' : '#22c55e';
  
  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
};

const VehicleMarker = ({ vehicle, onDisable, onEnable }: VehicleMarkerProps) => {
  const icon = createVehicleIcon(vehicle.isParked, vehicle.ignitionStatus);
  
  const formatSpeed = (speed: number) => {
    return `${Math.round(speed)} mph`;
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString();
  };

  return (
    <Marker 
      position={[vehicle.latitude, vehicle.longitude]} 
      icon={icon}
    >
      <Popup>
        <div className="min-w-[200px] p-1">
          <div className="font-semibold text-base mb-2">
            {vehicle.make} {vehicle.model}
          </div>
          
          {vehicle.licensePlate && (
            <div className="text-xs text-gray-500 mb-2">
              {vehicle.licensePlate}
            </div>
          )}

          {vehicle.driverName && (
            <div className="text-sm mb-2">
              Driver: <span className="font-medium">{vehicle.driverName}</span>
            </div>
          )}

          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2 text-sm">
              <Gauge className="w-4 h-4 text-gray-500" />
              <span>Speed: {formatSpeed(vehicle.speed)}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Navigation className="w-4 h-4 text-gray-500" />
              <span>Heading: {Math.round(vehicle.heading)}°</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Battery className="w-4 h-4 text-gray-500" />
              <span>Battery: {vehicle.batteryLevel}%</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Power className={`w-4 h-4 ${vehicle.ignitionStatus ? 'text-green-500' : 'text-red-500'}`} />
              <span>Ignition: {vehicle.ignitionStatus ? 'On' : 'Off'}</span>
            </div>
          </div>

          <div className="text-xs text-gray-400 mb-3">
            Last update: {formatTime(vehicle.timestamp)}
          </div>

          <div className="flex gap-2">
            {vehicle.ignitionStatus ? (
              <Button 
                size="sm" 
                variant="destructive" 
                className="w-full text-xs"
                onClick={() => onDisable?.(vehicle.vehicleId)}
              >
                <Power className="w-3 h-3 mr-1" />
                Disable Vehicle
              </Button>
            ) : (
              <Button 
                size="sm" 
                variant="hero" 
                className="w-full text-xs"
                onClick={() => onEnable?.(vehicle.vehicleId)}
              >
                <Power className="w-3 h-3 mr-1" />
                Enable Vehicle
              </Button>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

export default VehicleMarker;
