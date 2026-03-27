-- 021b: Seed service_pricing table (run this if 021 ran but the table appears empty)
-- Safe to run multiple times (ON CONFLICT DO UPDATE refreshes labels/emojis)

INSERT INTO service_pricing (service_type, label, emoji, suggested_price, commission_pct, commission_fixed, sort_order)
VALUES
  ('limpieza',         'Limpieza del Hogar',     '🧹', NULL, 12.00, 0, 1),
  ('niera',            'Niñera / Cuidado Niños', '👶', NULL, 12.00, 0, 2),
  ('cocina',           'Cocinero/a',             '🍳', NULL, 12.00, 0, 3),
  ('eventos',          'Eventos / Catering',     '🎉', NULL, 12.00, 0, 4),
  ('cuidado_mascotas', 'Cuidado de Mascotas',    '🐾', NULL, 12.00, 0, 5),
  ('cuidado_adultos',  'Cuidado de Adultos',     '🧓', NULL, 12.00, 0, 6),
  ('aire_split',       'Aire / Split',           '❄️', NULL, 12.00, 0, 7),
  ('electrico',        'Electricidad',           '⚡', NULL, 12.00, 0, 8),
  ('plomeria',         'Plomería',               '🔧', NULL, 12.00, 0, 9),
  ('cerrajeria',       'Cerrajería',             '🔑', NULL, 12.00, 0, 10),
  ('otros',            'Otros Servicios',        '🛠️', NULL, 12.00, 0, 11)
ON CONFLICT (service_type) DO UPDATE
  SET label      = EXCLUDED.label,
      emoji      = EXCLUDED.emoji,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();
