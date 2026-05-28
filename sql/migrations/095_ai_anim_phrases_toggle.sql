-- 095_ai_anim_phrases_toggle.sql
-- Toggle independiente para habilitar/deshabilitar frases de animacion con IA.

INSERT INTO app_settings (key, value)
VALUES ('ai_anim_phrases_enabled', 'true')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
