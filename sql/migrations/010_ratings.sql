-- Migration 010: Rating system
-- Run this in the Supabase SQL Editor

-- 1. Add rating columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_rating NUMERIC(2,1);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_rating NUMERIC(2,1);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_rating_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_rating_note TEXT;

-- 2. Add aggregate rating fields to driver_profiles
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS total_ratings INTEGER DEFAULT 0;

-- 3. Client profiles table (stores public profile + aggregated rating)
CREATE TABLE IF NOT EXISTS client_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  display_name TEXT,
  phone       TEXT,
  photo_url   TEXT,
  avg_rating  NUMERIC(3,2) DEFAULT 0,
  total_ratings INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;

-- Allow service_role (used in API routes) full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_profiles' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON client_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
