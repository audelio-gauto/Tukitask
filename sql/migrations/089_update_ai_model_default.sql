-- 089_update_ai_model_default.sql
-- Actualiza el modelo AI a gemini-2.0-flash-lite (gemini-1.5-flash fue deprecado en v1beta).

insert into app_settings (key, value, label, description)
values (
  'ai_model',
  'gemini-2.0-flash-lite',
  'Modelo AI',
  'Modelo Gemini utilizado para mensajes de negociación. Usar gemini-2.0-flash-lite para mínimo costo.'
)
on conflict (key) do update
  set value = excluded.value;
