-- Migration 038: Dynamic surge pricing configuration
-- Adds 7 keys to pricing_settings for peak-hour and demand-based multipliers.
-- Admins can edit these values from the existing pricing_settings panel — no new UI needed.
-- All values use ON CONFLICT DO NOTHING → safe to re-run.

INSERT INTO public.pricing_settings (key, value, label, description) VALUES
  ('surge_peak_multiplier',   1.25, 'Multiplicador hora pico',      'Factor aplicado en horas pico (×1.25 = +25%). Ejemplo: precio base 10.000 → 12.500 en hora pico.'),
  ('surge_demand_multiplier', 1.40, 'Multiplicador alta demanda',   'Factor aplicado cuando ratio órdenes_pendientes/drivers_online supera el umbral (×1.40 = +40%).'),
  ('demand_ratio_threshold',  0.60, 'Umbral ratio demanda',         'Ratio mínimo órdenes_pendientes/drivers_online para activar surge. 0.6 = 6 órdenes por cada 10 drivers.'),
  ('peak_hour_start',         7,    'Inicio hora pico mañana',      'Hora (0–23, zona Paraguay UTC-4) donde empieza el pico mañana. Por defecto 7 = 07:00.'),
  ('peak_hour_end',           9,    'Fin hora pico mañana',         'Hora (0–23, zona Paraguay UTC-4) donde termina el pico mañana. Por defecto 9 = 09:00.'),
  ('peak_hour_start_2',       17,   'Inicio hora pico tarde',       'Hora (0–23, zona Paraguay UTC-4) donde empieza el pico tarde. Por defecto 17 = 17:00.'),
  ('peak_hour_end_2',         19,   'Fin hora pico tarde',          'Hora (0–23, zona Paraguay UTC-4) donde termina el pico tarde. Por defecto 19 = 19:00.')
ON CONFLICT (key) DO NOTHING;
