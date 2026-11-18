package com.tukitask.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.provider.Settings;

/** Notificación local de nuevas solicitudes (heads-up, sonido y vibración). */
public final class RequestNotifier {
    private static final String CHANNEL_ID = "tukitask_requests_v2";
    private static final int NOTIFICATION_ID = 44120;

    private RequestNotifier() {}

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Solicitudes de envío",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Nuevas solicitudes mientras TukiTask está en segundo plano");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setShowBadge(true);
        channel.setSound(
                Settings.System.DEFAULT_NOTIFICATION_URI,
                new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build());
        manager.createNotificationChannel(channel);
    }

    public static void notifyRequest(Context ctx, int count, String title, String body) {
        try {
            ensureChannel(ctx);
            NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            Intent open = new Intent(ctx, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent contentIntent = PendingIntent.getActivity(
                    ctx,
                    NOTIFICATION_ID,
                    open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(ctx, CHANNEL_ID)
                    : new Notification.Builder(ctx);

            builder.setSmallIcon(R.drawable.ic_stat_tukitask)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setPriority(Notification.PRIORITY_HIGH)
                    .setCategory(Notification.CATEGORY_CALL)
                    .setContentIntent(contentIntent)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(false)
                    .setNumber(Math.max(1, count))
                    .setDefaults(Notification.DEFAULT_ALL)
                    .setVibrate(new long[]{0, 300, 180, 300})
                    .setWhen(System.currentTimeMillis())
                    .setShowWhen(true);

            manager.notify(NOTIFICATION_ID, builder.build());
        } catch (Exception ignored) {
            // El permiso de notificaciones puede estar denegado; la burbuja sigue funcionando.
        }
    }

    public static void clear(Context ctx) {
        try {
            NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {}
    }
}
