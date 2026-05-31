-- ============================================================
-- EV Exec Driver App — Schema Migration 001
-- Run this against the same Supabase project as the main site
-- ============================================================

-- 1. Drivers table (linked 1-to-1 with Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.drivers (
  id                   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            text        NOT NULL,
  phone                text,
  vehicle_registration text,
  vehicle_model        text,
  is_online            boolean     NOT NULL DEFAULT false,
  avatar_url           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers_select_own" ON public.drivers
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "drivers_update_own" ON public.drivers
  FOR UPDATE USING (auth.uid() = id);


-- 2. Extend bookings table with driver columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.drivers(id),
  ADD COLUMN IF NOT EXISTS driver_notes       text,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now();


-- 3. RLS on bookings (drivers see unassigned jobs + their own)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Available jobs: unassigned, open statuses
CREATE POLICY "drivers_see_available_bookings" ON public.bookings
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.drivers WHERE id = auth.uid())
    AND assigned_driver_id IS NULL
    AND status IN ('pending', 'accepted')
  );

-- Assigned jobs: driver sees their own active bookings
CREATE POLICY "drivers_see_assigned_bookings" ON public.bookings
  FOR SELECT
  USING (assigned_driver_id = auth.uid());

-- Drivers may only update rows assigned to them
CREATE POLICY "drivers_update_assigned_bookings" ON public.bookings
  FOR UPDATE
  USING (assigned_driver_id = auth.uid());


-- 4. Atomic job-accept RPC (prevents race-condition double-booking)
CREATE OR REPLACE FUNCTION public.driver_accept_booking(
  p_booking_id uuid,
  p_driver_id  uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  UPDATE public.bookings
  SET
    assigned_driver_id = p_driver_id,
    status             = CASE WHEN status = 'pending' THEN 'accepted' ELSE status END,
    updated_at         = now()
  WHERE
    id                 = p_booking_id
    AND assigned_driver_id IS NULL
    AND status         IN ('pending', 'accepted')
  RETURNING id INTO v_booking_id;

  IF v_booking_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error',   'This job has already been taken or is no longer available.'
    );
  END IF;

  RETURN json_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_accept_booking(uuid, uuid) TO authenticated;


-- 5. Status-progression RPC (validates allowed transitions server-side)
CREATE OR REPLACE FUNCTION public.driver_update_status(
  p_booking_id uuid,
  p_status     text,
  p_driver_id  uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current text;
  v_allowed text[];
BEGIN
  SELECT status INTO v_current
  FROM public.bookings
  WHERE id = p_booking_id AND assigned_driver_id = p_driver_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Booking not found or not assigned to you.');
  END IF;

  v_allowed := CASE v_current
    WHEN 'accepted' THEN ARRAY['en_route']
    WHEN 'en_route' THEN ARRAY['arrived']
    WHEN 'arrived'  THEN ARRAY['active']
    WHEN 'active'   THEN ARRAY['completed']
    ELSE                 ARRAY[]::text[]
  END;

  IF NOT (p_status = ANY(v_allowed)) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid transition: ' || v_current || ' → ' || p_status
    );
  END IF;

  UPDATE public.bookings
  SET status = p_status, updated_at = now()
  WHERE id = p_booking_id AND assigned_driver_id = p_driver_id;

  RETURN json_build_object('success', true, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_update_status(uuid, text, uuid) TO authenticated;


-- 6. updated_at auto-maintenance
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 7. Enable Realtime for live job-board updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;


-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS idx_bookings_driver      ON public.bookings(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status      ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_travel_date ON public.bookings(travel_date);
