# Event Architecture — Sistema de Notificaciones y Ofertas en Tiempo Real

> Arquitectura tipo Uber/InDrive para la plataforma TukiDrivers.  
> Última actualización: Enero 2025

---

## Flujo General

```
Acción del usuario
    ↓
API Route (Next.js serverless)
    ↓
emitNotification() → safe_emit_notification() RPC
    ↓
PostgreSQL (notifications table)
    ↓
Supabase Realtime (postgres_changes WebSocket)
    ↓
useNotifications hook (cliente/driver/técnico)
    ↓
UI: NotificationBell (badge + dropdown) + UrgentNotificationPopup (fullscreen)
```

---

## Niveles de Prioridad

| Prioridad | Comportamiento UI | TTL (cleanup) | Push Channel |
|-----------|-------------------|---------------|-------------|
| `urgent`  | Popup fullscreen + sonido 3 tonos + vibración | 14 días | both (in-app + push) |
| `high`    | Popup + sonido doble ding | 14 días | both |
| `normal`  | Badge en campana | 7 días | in_app only |
| `silent`  | Sin UI visible | 3 días | in_app only |

### Prioridad por tipo de notificación (defaults)

| Tipo | Prioridad default |
|------|-------------------|
| `new_offer`, `new_job_offer` | urgent |
| `offer_accepted`, `job_accepted` | urgent |
| `offer_rejected` | high |
| `status_change`, `job_status` | high |
| `new_order`, `new_job` | normal |
| `commission`, `wallet` | normal |
| `rating` | silent |

---

## Deduplicación (Anti-Spam)

### Flujo con `group_key`

```
emitNotification(userEmail, 'new_offer', title, body,
  { order_id: '...' },
  { groupKey: 'offer:order:abc123' }
)
    ↓
safe_emit_notification() RPC:
  1. ¿Existe notificación con mismo group_key + user + unread?
     → SÍ: UPDATE título/body/timestamp (triggers realtime UPDATE)
     → NO: INSERT nueva (triggers realtime INSERT)
```

### Índice parcial

```sql
CREATE UNIQUE INDEX idx_notifications_dedup
  ON notifications (user_email, group_key)
  WHERE read = false AND group_key IS NOT NULL;
```

Resultado: Si un cliente recibe 5 ofertas para el mismo pedido, solo ve 1 notificación actualizada (no 5 spam).

---

## Reglas de Negocio (safe_emit_notification)

El RPC valida estado antes de emitir:

1. **Ofertas (`new_offer`, `new_job_offer`)**: Solo emite si el pedido/job está en `pending` o `negotiating`. Si ya fue aceptado/completado → retorna NULL (no emite).

2. **Status cambios (`status_change`, `job_status`)**: No emite si el pedido/job fue `cancelled`.

3. **Fallback**: Si el RPC no está desplegado aún (error 42883), hace INSERT directo sin validación.

---

## Ofertas en Tiempo Real (InDrive-style)

### `useRealtimeOffers` hook

```
Suscripción Realtime → driver_offers + tecnico_job_offers
    ↓
LiveOffer type unificado (envio | servicio)
    ↓
Timer de 1 segundo → countdown de expires_at
    ↓
Auto-remove ofertas expiradas
    ↓
Ordenamiento configurable: price_asc | price_desc | time | rating
```

### Campos nuevos en ofertas

```sql
ALTER TABLE driver_offers ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE tecnico_job_offers ADD COLUMN expires_at TIMESTAMPTZ;
```

### Limpieza automática

```sql
CREATE FUNCTION expire_stale_offers() → UPDATE status = 'expired'
-- Ejecutar via pg_cron cada 30 segundos (si disponible)
```

---

## Componentes UI

### NotificationBell
- **Ubicación**: Layouts de driver, técnico, y cliente
- **Badge**: Rojo con conteo de no leídas (max 99+)
- **Dropdown**: Panel con lista scrollable, colores por tipo, borde izquierdo por prioridad
- **Animación**: bellShake al recibir urgent, badgePop en conteo, notifSlideIn en items

### UrgentNotificationPopup
- **Trigger**: `latestUrgent` de useNotifications (prioridad urgent o high)
- **Sonido**: Web Audio API — 3 tonos ascendentes (urgent) o doble ding (high)
- **Vibración**: `navigator.vibrate([100,50,100,50,200])` para urgent
- **Auto-dismiss**: 8s urgent, 5s high
- **Visual**: Fullscreen overlay con backdrop, animated slide-in, colores por tipo

---

## Realtime Channels

| Canal | Tabla | Filtro | Eventos |
|-------|-------|--------|---------|
| `notifications-{email}` | notifications | `user_email=eq.{email}` | INSERT, UPDATE |
| `driver-offers` | driver_offers | (global, filtrar en cliente) | INSERT, UPDATE, DELETE |
| `tecnico-offers` | tecnico_job_offers | (global, filtrar en cliente) | INSERT, UPDATE, DELETE |

---

## Push Notifications (prep)

### Infraestructura lista

1. **`push_tokens` table** (SQL 025): user_email + token + platform (web/android/ios)
2. **`POST /api/push-tokens`**: Registrar token FCM del dispositivo
3. **`DELETE /api/push-tokens`**: Eliminar token al logout
4. **`dispatchPush()`** en `pushService.ts`: Busca tokens + prepara payload

### Para activar FCM
1. Configurar proyecto Firebase
2. Agregar `FIREBASE_SERVER_KEY` en Vercel env vars
3. Descomentar `sendFCM()` en `pushService.ts`
4. Agregar service worker (`public/firebase-messaging-sw.js`)
5. Llamar `dispatchPush()` desde `emitNotification()` 

---

## Cleanup Automático

```sql
-- cleanup_old_notifications(): TTL por prioridad
urgent/high: 14 días
normal: 7 días
silent: 3 días
read: 3 días (cualquier prioridad)

-- expire_stale_offers(): ofertas pendientes con expires_at pasado → status = 'expired'
```

### pg_cron (Supabase Pro)

```sql
SELECT cron.schedule('cleanup-notifications', '0 3 * * *', 'SELECT cleanup_old_notifications()');
SELECT cron.schedule('expire-offers', '*/30 * * * * *', 'SELECT expire_stale_offers()');
```

---

## Archivos del Sistema

| Archivo | Propósito |
|---------|-----------|
| `sql/migrations/025_notifications.sql` | Tablas base: notifications, push_tokens |
| `sql/migrations/026_notifications_v2.sql` | Priority, dedup, expiry, business rules, cleanup |
| `src/lib/notifications.ts` | Tipos, prioridades, buildNotification() |
| `src/lib/notificationEmitter.ts` | Emisor server-side con RPC + fallback |
| `src/lib/useNotifications.ts` | Hook cliente con realtime + prioridad |
| `src/lib/useRealtimeOffers.ts` | Hook ofertas InDrive-style |
| `src/lib/pushService.ts` | Dispatch push (prep para FCM) |
| `src/components/NotificationBell.tsx` | Campana con dropdown |
| `src/components/UrgentNotificationPopup.tsx` | Popup fullscreen urgente |
| `src/app/api/notifications/route.ts` | GET + PATCH notificaciones |
| `src/app/api/push-tokens/route.ts` | POST + DELETE tokens push |

---

## Despliegue

### Checklist

- [ ] Ejecutar `026_notifications_v2.sql` en Supabase SQL Editor
- [ ] Verificar que `safe_emit_notification` RPC funciona: `SELECT safe_emit_notification('test@test.com', 'rating', 'test', 'test');`
- [ ] (Opcional) Habilitar pg_cron para cleanup/expiry automáticos
- [ ] (Futuro) Configurar Firebase + FIREBASE_SERVER_KEY para push
- [ ] Ejecutar `npx next build` para verificar 0 errores
