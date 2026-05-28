-- 094_neg_anim_phrases.sql
-- Seeds animation phrases for the TukiBot negotiation animation screen.
-- These are editable from Admin → Control AI → TukiBot mensajes.

INSERT INTO app_settings (key, value) VALUES
  ('neg_anim_phrases', '["Dame 3 segundos\u2026","Le estoy convenciendo \uD83D\uDE0F","Dame 3 segundos m\u00E1s, ya casi\u2026","El vendedor respir\u00F3 hondo\u2026","Creo que acepta...","🤖 Dame unos segundos\u2026 est\u00E1 dudando...","📉 El precio acaba de tambalearse..."]'),
  ('neg_anim_climax_accepted',  '😮 ALTO\u2026 creo que va a aceptar'),
  ('neg_anim_climax_countered', '👀 El vendedor no cedi\u00F3 m\u00E1s, pero baj\u00F3 bastante')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
