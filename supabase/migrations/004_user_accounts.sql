-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  privilege_points INTEGER NOT NULL DEFAULT 0,
  push_enabled     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Web Push subscriptions (one user can have many devices)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_phone TEXT,
  customer_email TEXT,
  endpoint       TEXT NOT NULL,
  p256dh         TEXT NOT NULL,
  auth_key       TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint)
);

-- Associate bookings with auth users
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Trigger: auto-create profile row after signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS on profiles (service role bypasses automatically)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "users_own_profile_select" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY IF NOT EXISTS "users_own_profile_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS on push_subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "push_own_select" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "push_own_insert" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY IF NOT EXISTS "push_own_delete" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
