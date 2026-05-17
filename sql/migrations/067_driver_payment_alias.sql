-- Migration 067: Add tigo_money_alias to driver_profiles
-- Stores the driver's Tigo Money / payment alias shown to clients in mandadito payment flow.

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS tigo_money_alias TEXT;

COMMENT ON COLUMN driver_profiles.tigo_money_alias IS 'Tigo Money alias or payment number shown to client when requesting mandadito payment transfer';
