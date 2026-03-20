-- Migration: create orders table for delivery requests

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, completed, cancelled
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  sender_contact TEXT,
  sender_phone TEXT,
  sender_address TEXT,
  sender_ref TEXT,
  receiver_contact TEXT,
  receiver_phone TEXT,
  receiver_address TEXT,
  description TEXT,
  instructions TEXT,
  payment_method TEXT,
  suggested_price NUMERIC(10,2),
  offer NUMERIC(10,2),
  accepted_by UUID, -- driver id
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
