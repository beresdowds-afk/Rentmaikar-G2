-- Create enum for device status
CREATE TYPE public.device_status AS ENUM ('inactive', 'active', 'offline', 'maintenance');

-- Create vehicles table first (if not exists)
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  license_plate TEXT NOT NULL UNIQUE,
  vin TEXT UNIQUE,
  color TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create IoT devices table
CREATE TABLE public.iot_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  imei TEXT UNIQUE,
  sim_number TEXT,
  sim_provider TEXT,
  firmware_version TEXT,
  device_model TEXT DEFAULT 'GPS-01',
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  status device_status DEFAULT 'inactive',
  is_linked BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  last_ping TIMESTAMPTZ,
  battery_level INTEGER CHECK (battery_level >= 0 AND battery_level <= 100),
  signal_strength INTEGER CHECK (signal_strength >= 0 AND signal_strength <= 100),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create device activity log for audit trail
CREATE TABLE public.device_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES public.iot_devices(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iot_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_activity_log ENABLE ROW LEVEL SECURITY;

-- Create app_role enum if not exists
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'owner', 'driver');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_roles table if not exists
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create is_admin function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- RLS Policies for vehicles
CREATE POLICY "Admins can manage all vehicles"
ON public.vehicles FOR ALL
TO authenticated
USING (public.is_admin());

CREATE POLICY "Owners can view their vehicles"
ON public.vehicles FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

-- RLS Policies for iot_devices (admin only)
CREATE POLICY "Admins can manage all devices"
ON public.iot_devices FOR ALL
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert devices"
ON public.iot_devices FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- RLS Policies for device_activity_log (admin only)
CREATE POLICY "Admins can view device logs"
ON public.device_activity_log FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert device logs"
ON public.device_activity_log FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_iot_devices_updated_at
BEFORE UPDATE ON public.iot_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();