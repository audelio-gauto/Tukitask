-- 083_update_bot_messages_to_new_defaults.sql
-- Actualiza las filas existentes que aún tienen los textos cortos viejos
-- hacia los nuevos mensajes completos con marcador {hora}.
-- Correr DESPUÉS de 082_bot_custom_messages.sql

update vendor_bot_config
set msg_auto_counter = '🔥 Oferta exclusiva hasta las {hora}. Aprovechá este precio especial antes de que vuelva a subir.'
where msg_auto_counter in ('el precio sube de vuelta', '');

update vendor_bot_config
set msg_auto_accept = 'Tu oferta fue aprobada por tiempo limitado hasta las {hora}. Confirmá ahora y asegurá este precio antes de que regrese al valor normal.'
where msg_auto_accept in ('el precio vuelve al normal', '');

update vendor_bot_config
set msg_pressure_client = '⚡ Última oportunidad hasta las {hora}. Aprovechá el descuento antes de que el precio vuelva a aumentar.'
where msg_pressure_client in ('el precio sube de vuelta', '');
