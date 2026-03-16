# Enviar notificaciones push a drivers registrados (Firebase Cloud Messaging)

## 1. Obtener los tokens FCM de los drivers
- Los tokens se guardan en el user_meta `_tukitask_fcm_tokens` (array) y `_tukitask_fcm_token` (último token).
- Puedes obtenerlos en PHP:

```php
$tokens = get_user_meta($user_id, '_tukitask_fcm_tokens', true);
```

## 2. Configurar tu Server Key de FCM
- Ve a Firebase Console > Project Settings > Cloud Messaging > Server key.
- Guarda la clave en Ajustes del plugin (`tukitask_ld_fcm_server_key`).

## 3. Ejemplo de envío desde PHP

```php
use Tukitask\LocalDrivers\Helpers\Push_Manager;
Push_Manager::send_notification($user_id, 'Nuevo pedido asignado', 'Tienes un nuevo pedido para entregar', 'https://tusitio.com/driver-dashboard/');
```

## 4. Ejemplo de envío manual vía cURL

```bash
curl -X POST \
  -H "Authorization: key=TU_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "registration_ids": ["TOKEN1", "TOKEN2"],
    "notification": {
      "title": "Nuevo pedido asignado",
      "body": "Tienes un nuevo pedido para entregar",
      "icon": "https://tusitio.com/wp-content/plugins/tukitask-local-drivers/assets/img/icon-192.png",
      "click_action": "https://tusitio.com/driver-dashboard/"
    },
    "data": {
      "url": "https://tusitio.com/driver-dashboard/"
    },
    "priority": "high"
  }' \
  https://fcm.googleapis.com/fcm/send
```

## 5. Notas
- El Service Worker y el frontend ya soportan mensajes FCM y Push API.
- Puedes enviar notificaciones a todos los tokens de un usuario.
- El campo `click_action` o `data.url` define la URL que se abrirá al hacer clic en la notificación.
