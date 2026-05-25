-- 081_drop_counter_formula_columns.sql
-- Remove counter_formula and counter_percent from vendor_bot_config.
-- These columns were never used by the negotiation engine (always used midpoint).

alter table vendor_bot_config
  drop column if exists counter_formula,
  drop column if exists counter_percent;
