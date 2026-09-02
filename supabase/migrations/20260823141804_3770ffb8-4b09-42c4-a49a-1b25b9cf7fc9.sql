-- 1. Driver submits referees AFTER registration; this unlocks pickup location access.
create or replace function public.submit_driver_referees(_referees jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _app record;
  _r jsonb;
  _i int;
  _name text; _phone text; _addr text; _email text;
begin
  if _uid is null then raise exception 'Not authenticated'; end if;

  if jsonb_typeof(_referees) <> 'array' or jsonb_array_length(_referees) <> 3 then
    raise exception 'Exactly three referees are required';
  end if;

  select id into _app from public.applications
   where user_id = _uid and application_type = 'driver'
   order by created_at desc limit 1;
  if not found then raise exception 'No driver application found for this account'; end if;

  -- validate every referee before writing anything
  for _i in 0..2 loop
    _r := _referees -> _i;
    _name  := nullif(trim(coalesce(_r->>'name','')), '');
    _phone := nullif(trim(coalesce(_r->>'phone','')), '');
    _addr  := nullif(trim(coalesce(_r->>'address','')), '');
    _email := nullif(trim(coalesce(_r->>'email','')), '');
    if _name is null or char_length(_name) < 2 or char_length(_name) > 100 then
      raise exception 'Referee % name is required (2-100 characters)', _i + 1;
    end if;
    if _phone is null or _phone !~ '^\+[1-9]\d{6,14}$' then
      raise exception 'Referee % phone must be in international format (e.g. +2348012345678)', _i + 1;
    end if;
    if _addr is not null and char_length(_addr) > 200 then
      raise exception 'Referee % address is too long (max 200 characters)', _i + 1;
    end if;
    if _email is not null and (char_length(_email) > 255 or _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      raise exception 'Referee % email is invalid', _i + 1;
    end if;
  end loop;

  update public.applications set
    referee1_name    = nullif(trim(_referees->0->>'name'), ''),
    referee1_phone   = trim(_referees->0->>'phone'),
    referee1_address = nullif(trim(coalesce(_referees->0->>'address','')), ''),
    referee1_email   = nullif(trim(coalesce(_referees->0->>'email','')), ''),
    referee2_name    = nullif(trim(_referees->1->>'name'), ''),
    referee2_phone   = trim(_referees->1->>'phone'),
    referee2_address = nullif(trim(coalesce(_referees->1->>'address','')), ''),
    referee2_email   = nullif(trim(coalesce(_referees->1->>'email','')), ''),
    referee3_name    = nullif(trim(_referees->2->>'name'), ''),
    referee3_phone   = trim(_referees->2->>'phone'),
    referee3_address = nullif(trim(coalesce(_referees->2->>'address','')), ''),
    referee3_email   = nullif(trim(coalesce(_referees->2->>'email','')), ''),
    updated_at       = now()
  where id = _app.id;

  for _i in 0..2 loop
    _r := _referees -> _i;
    insert into public.referee_verifications
      (application_id, user_id, referee_index, full_name, phone, email)
    values
      (_app.id, _uid, _i, trim(_r->>'name'), trim(_r->>'phone'),
       nullif(trim(coalesce(_r->>'email','')), ''))
    on conflict (application_id, referee_index) do update set
      full_name  = excluded.full_name,
      phone      = excluded.phone,
      email      = excluded.email,
      status     = 'pending',
      updated_at = now();
  end loop;

  insert into public.application_audit_log (application_id, actor_id, actor_role, action, changed, details)
  values (_app.id, _uid, 'driver', 'referees_submitted', '["referees"]'::jsonb,
          jsonb_build_object('count', 3));

  return _app.id;
end;
$$;

revoke all on function public.submit_driver_referees(jsonb) from public, anon;
grant execute on function public.submit_driver_referees(jsonb) to authenticated;

-- 2. Driver reads pickup details for their active rental ONLY after referees are on file.
create or replace function public.get_my_pickup_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _rental record;
  _submitted boolean;
begin
  if _uid is null then raise exception 'Not authenticated'; end if;

  select r.id as rental_id, v.id as vehicle_id, v.make, v.model, v.year,
         v.license_plate, v.pickup_location, v.pickup_address,
         v.pickup_city, v.pickup_instructions
    into _rental
    from public.rentals r
    join public.vehicles v on v.id = r.vehicle_id
   where r.driver_id = _uid and r.status = 'active'
   order by r.created_at desc limit 1;

  if not found then
    return jsonb_build_object('has_rental', false, 'referees_submitted', false);
  end if;

  select exists (
    select 1 from public.applications a
     where a.user_id = _uid and a.application_type = 'driver'
       and nullif(trim(coalesce(a.referee1_name,'')), '') is not null
       and nullif(trim(coalesce(a.referee1_phone,'')), '') is not null
       and nullif(trim(coalesce(a.referee2_name,'')), '') is not null
       and nullif(trim(coalesce(a.referee2_phone,'')), '') is not null
       and nullif(trim(coalesce(a.referee3_name,'')), '') is not null
       and nullif(trim(coalesce(a.referee3_phone,'')), '') is not null
  ) into _submitted;

  return jsonb_build_object(
    'has_rental', true,
    'referees_submitted', _submitted,
    'rental_id', _rental.rental_id,
    'vehicle', jsonb_build_object(
      'make', _rental.make, 'model', _rental.model,
      'year', _rental.year, 'license_plate', _rental.license_plate),
    'pickup', case when _submitted then jsonb_build_object(
        'location', _rental.pickup_location,
        'address', _rental.pickup_address,
        'city', _rental.pickup_city,
        'instructions', _rental.pickup_instructions)
      else null end
  );
end;
$$;

revoke all on function public.get_my_pickup_details() from public, anon;
grant execute on function public.get_my_pickup_details() to authenticated;

-- 3. Owners must provide the pickup location BEFORE submitting vehicle credentials/photos.
create or replace function public.enforce_vehicle_pickup_before_listing()
returns trigger
language plpgsql
as $$
begin
  -- Applies to direct owner submissions from the app (authenticated owner = row owner).
  -- Service-role / admin imports (auth.uid() is null) bypass this guard.
  if auth.uid() is not null and auth.uid() = NEW.owner_id then
    if nullif(trim(coalesce(NEW.pickup_city, '')), '') is null
       or nullif(trim(coalesce(NEW.pickup_address, '')), '') is null then
      raise exception 'Set the vehicle pickup city and street address before submitting vehicle credentials and photos.';
    end if;
  end if;
  return NEW;
end;
$$;

revoke all on function public.enforce_vehicle_pickup_before_listing() from public, anon, authenticated;

drop trigger if exists trg_vehicles_require_pickup_on_owner_insert on public.vehicles;
create trigger trg_vehicles_require_pickup_on_owner_insert
  before insert on public.vehicles
  for each row execute function public.enforce_vehicle_pickup_before_listing();