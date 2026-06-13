-- Calendar Engine, Auto-Dispatch and Loyalty support
-- Idempotent: safe to run even if some objects already exist.

create extension if not exists pgcrypto;

-- Drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  email       TEXT        UNIQUE,
  phone       TEXT,
  vehicle     TEXT,
  plate       TEXT,
  status      TEXT        DEFAULT 'active',
  is_online   BOOLEAN     NOT NULL DEFAULT FALSE,
  rating      NUMERIC(2,1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Dispatch / job tracking columns on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_notes TEXT,
  ADD COLUMN IF NOT EXISTS duration_mins INT,
  ADD COLUMN IF NOT EXISTS loyalty_awarded BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes used by the calendar audit and auto-dispatch algorithm
CREATE INDEX IF NOT EXISTS bookings_travel_date_idx          ON public.bookings (travel_date);
CREATE INDEX IF NOT EXISTS bookings_assigned_driver_date_idx ON public.bookings (assigned_driver_id, travel_date);

-- Drivers can read their own record (matched by email); service role bypasses RLS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'drivers' AND policyname = 'drivers_own_select'
  ) THEN
    CREATE POLICY "drivers_own_select" ON public.drivers
      FOR SELECT USING (auth.jwt() ->> 'email' = email);
  END IF;
END $$;
