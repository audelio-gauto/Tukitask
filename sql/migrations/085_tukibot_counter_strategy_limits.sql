-- 085_tukibot_counter_strategy_limits.sql
-- Add configurable anti-lowball knobs for Tukibot counter-offer strategy.

insert into negotiation_limits (id, name, key, description, value, unit, min, max, step, is_active)
values
  ('counter_band_min_pct', 'Banda aleatoria minima', 'counter_band_min_pct', 'Porcentaje minimo del rango (precio piso a publicado) donde puede caer la contraoferta.', 58, '%', 40, 90, 1, true),
  ('counter_band_max_pct', 'Banda aleatoria maxima', 'counter_band_max_pct', 'Porcentaje maximo del rango (precio piso a publicado) donde puede caer la contraoferta.', 78, '%', 45, 95, 1, true),
  ('lowball_threshold_pct', 'Umbral oferta baja', 'lowball_threshold_pct', 'Si la oferta del cliente cae por debajo de este porcentaje del precio publicado, se considera lowball.', 60, '%', 20, 95, 1, true),
  ('lowball_hardening_per_repeat_pct', 'Endurecimiento por lowball repetido', 'lowball_hardening_per_repeat_pct', 'Incremento de dureza por cada lowball repetido en el historial reciente del mismo cliente y producto.', 3, '%', 0, 20, 0.5, true),
  ('lowball_hardening_severity_pct', 'Endurecimiento por severidad', 'lowball_hardening_severity_pct', 'Multiplicador de dureza adicional segun que tan baja sea la oferta actual.', 6, '%', 0, 25, 0.5, true),
  ('round1_max_discount_pct', 'Descuento maximo ronda 1', 'round1_max_discount_pct', 'Descuento maximo permitido en la primera contraoferta para no revelar piso temprano.', 12, '%', 1, 60, 1, true),
  ('round2_max_discount_pct', 'Descuento maximo ronda 2', 'round2_max_discount_pct', 'Descuento maximo permitido en la segunda ronda de negociacion.', 18, '%', 1, 70, 1, true),
  ('round3_max_discount_pct', 'Descuento maximo ronda 3', 'round3_max_discount_pct', 'Descuento maximo permitido en la tercera ronda de negociacion.', 24, '%', 1, 80, 1, true),
  ('roundN_max_discount_pct', 'Descuento maximo ronda final', 'roundN_max_discount_pct', 'Descuento maximo permitido desde la cuarta ronda en adelante.', 30, '%', 1, 90, 1, true),
  ('probing_guard_trigger_floor_pct', 'Activacion guardia anti-sondeo', 'probing_guard_trigger_floor_pct', 'Activa defensa anti-sondeo si la oferta del cliente cae por debajo de este porcentaje del precio piso.', 75, '%', 30, 120, 1, true),
  ('probing_guard_span_pct', 'Guardia anti-sondeo sobre rango', 'probing_guard_span_pct', 'Porcentaje del rango (piso-publicado) que se protege ante sondeo extremo para evitar mostrar piso.', 25, '%', 5, 60, 1, true),
  ('offer_influence_low_pct', 'Influencia oferta lowball', 'offer_influence_low_pct', 'Peso de la oferta del cliente cuando esta por debajo del umbral lowball.', 22, '%', 5, 60, 1, true),
  ('offer_influence_normal_pct', 'Influencia oferta normal', 'offer_influence_normal_pct', 'Peso de la oferta del cliente cuando esta por encima del umbral lowball.', 34, '%', 5, 80, 1, true),
  ('counter_jitter_step_gs', 'Jitter por paso', 'counter_jitter_step_gs', 'Variacion aleatoria por pasos para evitar ingenieria inversa del precio exacto de contraoferta.', 1000, 'Gs', 0, 10000, 500, true),
  ('counter_jitter_min_steps', 'Jitter pasos minimos', 'counter_jitter_min_steps', 'Cantidad minima de pasos de jitter (puede ser negativo).', -1, 'pasos', -5, 0, 1, true),
  ('counter_jitter_max_steps', 'Jitter pasos maximos', 'counter_jitter_max_steps', 'Cantidad maxima de pasos de jitter (puede ser positivo).', 2, 'pasos', 0, 8, 1, true)
on conflict (id) do nothing;
