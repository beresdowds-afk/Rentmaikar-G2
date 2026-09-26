import { describe, it, expect, vi } from 'vitest';
import { areVehicleMarkerPropsEqual, getVehicleIcon, VehicleMarkerProps } from '../VehicleMarker';

describe('Memoized VehicleMarker Component', () => {
  const baseVehicle: VehicleMarkerProps['vehicle'] = {
    vehicleId: 'veh_test_001',
    latitude: 6.5244,
    longitude: 3.3792,
    speed: 45,
    heading: 180,
    batteryLevel: 92,
    ignitionStatus: true,
    isParked: false,
    timestamp: new Date('2026-09-26T10:00:00Z'),
    make: 'Toyota',
    model: 'Corolla',
    licensePlate: 'ABC-123-XY',
    driverName: 'Adeola Johnson',
    agreementStatus: 'completed',
    isTrackingGated: false,
    address: 'Victoria Island, Lagos',
  };

  const dummyOnDisable = vi.fn();
  const dummyOnEnable = vi.fn();

  it('correctly identifies identical props and skips re-renders', () => {
    const prevProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    const nextProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    expect(areVehicleMarkerPropsEqual(prevProps, nextProps)).toBe(true);
  });

  it('triggers re-render when latitude or longitude changes (telemetry update)', () => {
    const prevProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle, latitude: 6.5244 },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    const nextProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle, latitude: 6.5255 },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    expect(areVehicleMarkerPropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('triggers re-render when vehicle status changes (parked / ignition / speed)', () => {
    const prevProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle, speed: 45, isParked: false },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    const nextProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle, speed: 0, isParked: true },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    expect(areVehicleMarkerPropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('triggers re-render when ignition is disabled or enabled', () => {
    const prevProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle, ignitionStatus: true },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    const nextProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle, ignitionStatus: false },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    expect(areVehicleMarkerPropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('triggers re-render when handler callback reference changes', () => {
    const prevProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle },
      onDisable: dummyOnDisable,
      onEnable: dummyOnEnable,
    };

    const nextProps: VehicleMarkerProps = {
      vehicle: { ...baseVehicle },
      onDisable: vi.fn(),
      onEnable: dummyOnEnable,
    };

    expect(areVehicleMarkerPropsEqual(prevProps, nextProps)).toBe(false);
  });

  it('caches Leaflet DivIcon instances across calls to prevent icon thrashing', () => {
    const activeIcon1 = getVehicleIcon(false, true);
    const activeIcon2 = getVehicleIcon(false, true);
    expect(activeIcon1).toBe(activeIcon2);

    const parkedIcon1 = getVehicleIcon(true, true);
    const parkedIcon2 = getVehicleIcon(true, true);
    expect(parkedIcon1).toBe(parkedIcon2);

    const disabledIcon1 = getVehicleIcon(false, false);
    const disabledIcon2 = getVehicleIcon(false, false);
    expect(disabledIcon1).toBe(disabledIcon2);
  });
});
