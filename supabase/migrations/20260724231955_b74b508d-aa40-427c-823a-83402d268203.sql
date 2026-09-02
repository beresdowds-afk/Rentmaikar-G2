
-- 1) Assign admin role to eastfortemain@gmail.com if the account exists now,
--    and ensure it is assigned automatically the moment they sign up.
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'eastfortemain@gmail.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    -- Remove any conflicting non-admin default role rows so the admin sees the admin dashboard.
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role <> 'admin';
  END IF;
END $$;

-- 2) Enrich handle_new_user to also auto-assign a default 'driver' role for
--    OAuth signups (Google) when no role has been assigned yet, and to seed
--    preferred_country from Google's locale metadata when present.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := COALESCE(
    meta->>'full_name',
    meta->>'name',
    NULLIF(TRIM(CONCAT(meta->>'given_name', ' ', meta->>'family_name')), ''),
    NULL
  );
  v_avatar text := COALESCE(meta->>'avatar_url', meta->>'picture');
  v_phone text := COALESCE(NEW.phone, meta->>'phone');
  v_locale text := COALESCE(meta->>'locale', '');
  v_country text := CASE
    WHEN v_locale ILIKE '%-NG' OR v_locale ILIKE 'ng%' THEN 'NG'
    WHEN v_locale ILIKE '%-US' OR v_locale ILIKE 'en-US' THEN 'US'
    ELSE NULL
  END;
  v_provider text := COALESCE(meta->>'provider_id', meta->>'iss', '');
  v_email text := COALESCE(NEW.email, meta->>'email');
  v_is_admin_seed boolean := lower(COALESCE(v_email, '')) = 'eastfortemain@gmail.com';
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, phone, avatar_url, preferred_country)
  VALUES (NEW.id, v_email, NULLIF(v_full_name, ''), v_phone, v_avatar, v_country)
  ON CONFLICT (user_id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
        preferred_country = COALESCE(public.profiles.preferred_country, EXCLUDED.preferred_country);

  -- Auto-assign admin to the seeded admin email; otherwise default new OAuth/phone
  -- users to 'driver' when they have no role yet so the dashboard is reachable.
  IF v_is_admin_seed THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'driver')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
