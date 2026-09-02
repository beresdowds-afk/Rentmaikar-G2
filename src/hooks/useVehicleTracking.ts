import { useState, useEffect, useCallback } from 'react';
import { VehicleLocation, mqttTracker } from '@/lib/mqtt-client';
import { receiveMQTTMessage } from '@/services/mqttBridge';


interface UseVehicleTrackingOptions {
  vehicleId?: string;
  autoConnect?: boolean;
}

interface UseVehicleTrackingReturn {
  locations: Map<string, VehicleLocation>;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendCommand: (vehicleId: string, command: 'disable' | 'enable' | 'lock' | 'unlock') => Promise<void>;
}

export const useVehicleTracking = (options: UseVehicleTrackingOptions = {}): UseVehicleTrackingReturn => {
  const { vehicleId, autoConnect = false } = options;
  const [locations, setLocations] = useState<Map<string, VehicleLocation>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    if (isConnected || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      await mqttTracker.connect();
      setIsConnected(true);

      // Subscribe to vehicle updates
      if (vehicleId) {
        mqttTracker.subscribeToVehicle(vehicleId, (location) => {
          setLocations(prev => new Map(prev).set(location.vehicleId, location));
          receiveMQTTMessage(`rentmaikar/vehicle/${location.vehicleId}/telemetry`, location as unknown as Record<string, unknown>);
        });
      } else {
        mqttTracker.subscribeToAllVehicles((location) => {
          setLocations(prev => new Map(prev).set(location.vehicleId, location));
          receiveMQTTMessage(`rentmaikar/vehicle/${location.vehicleId}/telemetry`, location as unknown as Record<string, unknown>);
        });
      }

    } catch (err) {
      setError(err instanceof Error ? err : new Error('Connection failed'));
    } finally {
      setIsConnecting(false);
    }
  }, [vehicleId, isConnected, isConnecting]);

  const disconnect = useCallback(() => {
    mqttTracker.disconnect();
    setIsConnected(false);
    setLocations(new Map());
  }, []);

  const sendCommand = useCallback(async (
    targetVehicleId: string, 
    command: 'disable' | 'enable' | 'lock' | 'unlock'
  ) => {
    if (!isConnected) {
      throw new Error('Not connected to tracking system');
    }
    await mqttTracker.sendCommand(targetVehicleId, command);
  }, [isConnected]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      // Don't disconnect on unmount if other components might be using it
    };
  }, [autoConnect, connect]);

  return {
    locations,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendCommand,
  };
};
