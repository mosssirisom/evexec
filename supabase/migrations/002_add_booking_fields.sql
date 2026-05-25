ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS journey_type text,
  ADD COLUMN IF NOT EXISTS airport text,
  ADD COLUMN IF NOT EXISTS flight_number text,
  ADD COLUMN IF NOT EXISTS contact_method text DEFAULT 'WhatsApp',
  ADD COLUMN IF NOT EXISTS return_airport text,
  ADD COLUMN IF NOT EXISTS return_flight_number text,
  ADD COLUMN IF NOT EXISTS return_pickup text,
  ADD COLUMN IF NOT EXISTS return_destination text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quote_requests'
      AND policyname = 'anon_insert'
  ) THEN
    CREATE POLICY "anon_insert" ON public.quote_requests
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;
