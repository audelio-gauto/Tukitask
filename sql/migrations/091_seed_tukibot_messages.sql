-- 091_seed_tukibot_messages.sql
-- 10 variantes por tipo de mensaje fallback (40 en total).
-- Placeholders: {precio} {total} {ahorro} {producto}

insert into tukibot_messages (tipo, texto) values

-- ═══════════════════════════════════════════
-- ACEPTADAS — 1 unidad
-- ═══════════════════════════════════════════
('accepted_single', '¡Trato hecho! Te confirmamos {precio} por {producto} — ahorrás {ahorro} frente al precio publicado. ¡Procedé con el pago para asegurar tu pedido!'),
('accepted_single', '¡Oferta aceptada! {precio} por {producto} es tuyo. Confirmá el pago ahora y lo reservamos para vos.'),
('accepted_single', '¡Cerramos! {precio} por {producto}, con un ahorro de {ahorro}. No pierdas este precio — pagá ahora.'),
('accepted_single', 'Tu oferta de {precio} por {producto} fue aprobada. ¡Dale, confirmá el pago y es tuyo!'),
('accepted_single', '¡Listo! Aceptamos {precio} por {producto}. Guardamos tu pedido hasta que confirmes el pago.'),
('accepted_single', 'Hecho trato a {precio} por {producto}. Ahorrás {ahorro} — confirmá el pago para que no se vaya el precio.'),
('accepted_single', '¡Aprobado! {precio} por {producto} es tu precio especial. Completá el pago para asegurarlo.'),
('accepted_single', 'Cerramos a {precio} por {producto}. Con ese ahorro de {ahorro}, es una excelente decisión. ¡Pagá ahora!'),
('accepted_single', '¡Trato! {precio} por {producto} — te ahorrás {ahorro}. Confirmá el pago antes de que el precio vuelva al normal.'),
('accepted_single', '¡Negociación exitosa! Lleváte {producto} a {precio}. Ahorrás {ahorro}. Procedé con el pago para reservarlo.'),

-- ═══════════════════════════════════════════
-- ACEPTADAS — múltiples unidades
-- ═══════════════════════════════════════════
('accepted_multi', '¡Trato hecho! Te confirmamos {total} por {producto} — ahorrás {ahorro} en total frente al precio publicado. ¡Procedé con el pago!'),
('accepted_multi', '¡Listo! {total} por tu pedido de {producto}. Un ahorro de {ahorro} en total. Confirmá el pago ahora.'),
('accepted_multi', '¡Cerrado! Tu pedido de {producto} a {total} fue aprobado. Ahorrás {ahorro} llevándote varios.'),
('accepted_multi', '¡Aprobado! {total} por {producto}. Ese precio mayorista es una gran oportunidad — confirmá el pago.'),
('accepted_multi', 'Hecho trato: {total} por {producto}. Con {ahorro} de ahorro total, es el mejor precio que podemos darte.'),
('accepted_multi', '¡Excelente compra! {total} por {producto} con un ahorro de {ahorro}. Completá el pago para asegurar el pedido.'),
('accepted_multi', '¡Tu pedido de {producto} está listo a {total}! Ahorrás {ahorro} en total. Dale al pago para no perder este precio.'),
('accepted_multi', 'Cerramos a {total} por {producto} — {ahorro} de descuento total en tu pedido. ¡Procedé con el pago!'),
('accepted_multi', '¡Trato mayorista aprobado! {total} por {producto}. Un ahorro real de {ahorro}. Confirmá el pago ahora.'),
('accepted_multi', '¡Felicitaciones! Tu pedido de {producto} a {total} quedó asegurado. Ahorr\u00e1s {ahorro}. ¡Pagá para reservarlo!'),

-- ═══════════════════════════════════════════
-- CONTRAOFERTAS — 1 unidad
-- ═══════════════════════════════════════════
('countered_single', 'Nuestra mejor propuesta es {precio} por {producto}, así ya te llevás un ahorro real de {ahorro}. ¿Cerramos?'),
('countered_single', 'Te ofrecemos {precio} por {producto} — ya es lo mejor que podemos hacer. ¿Lo confirmamos?'),
('countered_single', '{precio} es nuestro precio final para {producto}. Con ese ahorro de {ahorro}, es una gran oportunidad. ¿Cerramos?'),
('countered_single', 'Podemos llegar a {precio} por {producto}. Es nuestro tope real — ¿aceptás?'),
('countered_single', 'La mejor oferta que tenemos es {precio} por {producto}. Ya incluye un ahorro de {ahorro}. ¿Va?'),
('countered_single', '{precio} por {producto} es lo más que podemos ceder. ¿Cerramos a ese precio?'),
('countered_single', 'Te hacemos precio especial: {precio} por {producto}, ahorrás {ahorro}. Es nuestro mejor número. ¿Trato?'),
('countered_single', 'Nuestra contraoferta es {precio} por {producto}. No podemos bajar más — ¿lo tomás?'),
('countered_single', 'Por {producto} te damos {precio} — un descuento de {ahorro}. Es lo máximo que podemos darte. ¿Cerramos?'),
('countered_single', 'Llegamos a {precio} por {producto}, ya con {ahorro} de ahorro incluido. ¿Confirmamos?'),

-- ═══════════════════════════════════════════
-- CONTRAOFERTAS — múltiples unidades
-- ═══════════════════════════════════════════
('countered_multi', 'Nuestra mejor propuesta es {total} por {producto}, así ya te llevás un ahorro real de {ahorro}. ¿Cerramos?'),
('countered_multi', 'Por tu pedido de {producto} llegamos a {total} en total. Es nuestro precio mayorista final. ¿Lo tomás?'),
('countered_multi', '{total} por {producto} — ahorrás {ahorro} llevándote varios. Es lo mejor que podemos hacer. ¿Cerramos?'),
('countered_multi', 'Precio especial por cantidad: {total} por {producto}. Con {ahorro} de descuento total. ¿Va?'),
('countered_multi', 'Para tu pedido de {producto}, nuestra oferta final es {total}. Ahorrás {ahorro} en total. ¿Trato?'),
('countered_multi', 'Llegamos a {total} por {producto} — es el mejor precio mayorista que tenemos. ¿Lo confirmamos?'),
('countered_multi', '{total} por tu pedido de {producto} es nuestro límite real. Ya incluye {ahorro} de descuento. ¿Cerramos?'),
('countered_multi', 'Por llevar varios {producto}, te damos {total} en total, ahorrás {ahorro}. ¿Aceptás?'),
('countered_multi', 'Nuestra mejor propuesta mayorista: {total} por {producto} con {ahorro} de ahorro. ¿Cerramos este pedido?'),
('countered_multi', 'Precio final por cantidad: {total} por {producto}. Un descuento real de {ahorro}. ¿Lo tomás?');
