
INSERT INTO public.platform_features (key, name, description, category, is_global_default)
VALUES
  ('insurance', 'Insurance Subscription', 'Compulsory insurance subscription for drivers and owners', 'feature', true),
  ('vehicle_activation', 'Vehicle Activation', 'Compulsory subscription that keeps a vehicle active on the platform', 'feature', true)
ON CONFLICT (key) DO NOTHING;
