-- Create the bookings table for the full booking workflow
CREATE TABLE IF NOT EXISTS public.bookings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Journey
  journey_type      TEXT,
  pickup_location   TEXT,
  airport           TEXT,
  flight_number     TEXT,
  dropoff_address   TEXT,
  travel_date       DATE,
  travel_time       TEXT,
  passengers        INT         NOT NULL DEFAULT 1,
  luggage           TEXT,

  -- Return journey
  return_journey    BOOLEAN     NOT NULL DEFAULT FALSE,
  return_pickup     TEXT,
  return_airport    TEXT,
  return_flight     TEXT,
  return_date       DATE,
  return_time       TEXT,
  return_destination TEXT,

  -- Customer
  customer_name     TEXT        NOT NULL,
  customer_phone    TEXT        NOT NULL,
  customer_email    TEXT,
  contact_method    TEXT        NOT NULL DEFAULT 'WhatsApp',

  -- Booking state
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','rejected','confirmed','cancelled')),
  operator_note     TEXT,

  -- Payment
  quoted_price      NUMERIC(8,2),
  payment_method    TEXT        CHECK (payment_method IN ('card','cash')),
  payment_status    TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending','paid','cash_on_day','refunded')),
  stripe_session_id TEXT
);

-- Indexes for operator dashboard and status lookups
CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON public.bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_status_idx     ON public.bookings (status);

-- Enable Row Level Security
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Anonymous users may INSERT only (form submissions via API use service role key which bypasses RLS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bookings'
      AND policyname = 'anon_insert_bookings'
  ) THEN
    CREATE POLICY "anon_insert_bookings"
      ON public.bookings
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- No SELECT policy for anon — all reads go through server-side API with service role key
