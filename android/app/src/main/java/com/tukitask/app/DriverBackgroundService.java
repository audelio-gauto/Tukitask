package com.tukitask.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.text.TextUtils;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Servicio en primer plano que mantiene la disponibilidad y busca solicitudes
 * mientras el conductor usa Google Maps/Waze u otra app.
 *
 * No usa Firebase: consulta un endpoint liviano con el token de Supabase y
 * refresca el token solo cuando vence. También renueva la última ubicación
 * conocida para que el cliente no vea al conductor como desconectado.
 */
public class DriverBackgroundService extends Service {
    private static final String TAG = "TukiDriverService";
    private static final String CHANNEL_ID = "tukitask_driver_online";
    private static final int SERVICE_NOTIFICATION_ID = 44110;
    private static final long POLL_MS = 6000;
    private static final long LOCATION_HEARTBEAT_MS = 90000;

    public static final String PREFS = "tuki_driver_session";
    public static final String KEY_API_BASE = "api_base";
    public static final String KEY_ACCESS_TOKEN = "access_token";
    public static final String KEY_REFRESH_TOKEN = "refresh_token";
    public static final String KEY_SUPABASE_URL = "supabase_url";
    public static final String KEY_SUPABASE_KEY = "supabase_key";
    public static final String KEY_LAT = "lat";
    public static final String KEY_LNG = "lng";
    private static final String KEY_KNOWN_IDS = "known_request_ids";

    private ScheduledExecutorService executor;
    private volatile boolean running = false;
    private long lastLocationPostAt = 0;

    public static void start(Context ctx) {
        if (!BubbleManager.isEnabled()) return;
        try {
            Intent intent = new Intent(ctx, DriverBackgroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent);
            else ctx.startService(intent);
        } catch (Exception error) {
            Log.w(TAG, "No se pudo iniciar el servicio en segundo plano", error);
        }
    }

    public static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, DriverBackgroundService.class));
        } catch (Exception ignored) {}
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        // Tras reiniciar el proceso Android recrea el servicio sin pasar por
        // la WebView: hay que recuperar la preferencia de la burbuja.
        BubbleManager.init(this);
        ensureChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            startAsForeground();
        } catch (Exception error) {
            Log.w(TAG, "No se pudo iniciar como servicio en primer plano", error);
            stopSelf();
            return START_NOT_STICKY;
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!BubbleManager.isEnabled() || prefs.getString(KEY_ACCESS_TOKEN, "").isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (executor == null) {
            executor = Executors.newSingleThreadScheduledExecutor();
            executor.scheduleWithFixedDelay(this::tick, 400, POLL_MS, TimeUnit.MILLISECONDS);
        }
        return START_STICKY;
    }

    /**
     * Android 15+ limita los servicios dataSync a 6 horas por día. Se cierra
     * de forma ordenada y vuelve a arrancar la próxima vez que el conductor
     * abre la app.
     */
    @Override
    public void onTimeout(int startId, int fgsType) {
        Log.w(TAG, "Se alcanzó el tiempo máximo del servicio de datos");
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
        RequestNotifier.clear(this);
        BubbleManager.setBadge(this, 0);
        try { stopForeground(true); } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "TukiTask conectado",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Busca solicitudes mientras la app está en segundo plano");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private void startAsForeground() {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                SERVICE_NOTIFICATION_ID,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_stat_tukitask)
                .setContentTitle("TukiTask conectado")
                .setContentText("Buscando solicitudes cerca de ti")
                .setOngoing(true)
                .setContentIntent(contentIntent)
                .setPriority(Notification.PRIORITY_LOW);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(SERVICE_NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, builder.build());
        }
    }

    private void tick() {
        if (!running) return;
        // Con la WebView visible, la página ya refresca el feed, la ubicación
        // y la insignia. El servicio espera para no duplicar avisos ni tráfico.
        if (MainActivity.isVisible()) return;
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            if (!BubbleManager.isEnabled()) {
                stopSelf();
                return;
            }
            String token = prefs.getString(KEY_ACCESS_TOKEN, "");
            if (token.isEmpty()) {
                stopSelf();
                return;
            }

            heartbeatLocationIfDue(prefs, token);
            // El heartbeat pudo renovar el token; usar el más reciente.
            token = prefs.getString(KEY_ACCESS_TOKEN, token);

            PollResult result = fetchRequests(prefs, token);
            if (result != null && result.unauthorized) {
                token = refreshAccessToken(prefs);
                if (token == null || token.isEmpty()) return;
                result = fetchRequests(prefs, token);
            }
            if (result != null && result.ok) handleOrders(prefs, result.orders);
        } catch (Exception error) {
            Log.w(TAG, "Fallo al buscar solicitudes", error);
        }
    }

    private void heartbeatLocationIfDue(SharedPreferences prefs, String token) {
        long now = System.currentTimeMillis();
        if (lastLocationPostAt != 0 && now - lastLocationPostAt < LOCATION_HEARTBEAT_MS) return;
        String latRaw = prefs.getString(KEY_LAT, "");
        String lngRaw = prefs.getString(KEY_LNG, "");
        if (latRaw.isEmpty() || lngRaw.isEmpty()) return;
        try {
            double lat = Double.parseDouble(latRaw);
            double lng = Double.parseDouble(lngRaw);
            if (postLocation(prefs, token, lat, lng, true)) lastLocationPostAt = now;
        } catch (NumberFormatException ignored) {}
    }

    private boolean postLocation(
            SharedPreferences prefs, String token, double lat, double lng, boolean allowRefresh) {
        HttpURLConnection connection = null;
        try {
            String apiBase = apiBase(prefs);
            if (apiBase.isEmpty()) return false;
            URL url = new URL(apiBase + "/api/driver-location");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            JSONObject payload = new JSONObject().put("lat", lat).put("lng", lng);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = connection.getResponseCode();
            if (code == 401 && allowRefresh) {
                String refreshed = refreshAccessToken(prefs);
                if (refreshed == null || refreshed.isEmpty()) return false;
                return postLocation(prefs, refreshed, lat, lng, false);
            }
            return code >= 200 && code < 300;
        } catch (Exception error) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private PollResult fetchRequests(SharedPreferences prefs, String token) {
        HttpURLConnection connection = null;
        try {
            String apiBase = apiBase(prefs);
            if (apiBase.isEmpty()) return null;
            URL url = new URL(apiBase + "/api/driver/background-requests");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            int code = connection.getResponseCode();
            if (code == 401) return PollResult.unauthorized();
            if (code < 200 || code >= 300) return null;

            String body = read(connection.getInputStream());
            JSONObject json = new JSONObject(body);
            JSONArray array = json.optJSONArray("orders");
            List<JSONObject> orders = new ArrayList<>();
            if (array != null) {
                for (int i = 0; i < array.length(); i++) {
                    JSONObject order = array.optJSONObject(i);
                    if (order != null) orders.add(order);
                }
            }
            return PollResult.ok(orders);
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void handleOrders(SharedPreferences prefs, List<JSONObject> orders) {
        Set<String> current = new HashSet<>();
        for (JSONObject order : orders) {
            String id = order.optString("id", "");
            if (!id.isEmpty()) current.add(id);
        }

        String stored = prefs.getString(KEY_KNOWN_IDS, "");
        Set<String> known = new HashSet<>();
        if (!stored.isEmpty()) {
            for (String id : stored.split(",")) {
                if (!id.isEmpty()) known.add(id);
            }
        }

        int count = orders.size();
        BubbleManager.setBadge(this, count);

        if (count == 0) {
            known.clear();
            prefs.edit().putString(KEY_KNOWN_IDS, "").apply();
            RequestNotifier.clear(this);
            return;
        }

        List<JSONObject> fresh = new ArrayList<>();
        for (JSONObject order : orders) {
            String id = order.optString("id", "");
            if (!id.isEmpty() && !known.contains(id)) fresh.add(order);
        }

        prefs.edit().putString(KEY_KNOWN_IDS, TextUtils.join(",", current)).apply();

        if (!fresh.isEmpty()) {
            JSONObject first = fresh.get(0);
            String pickup = first.optString("pickup_address", "Origen");
            String delivery = first.optString("delivery_address", "Destino");
            double price = first.optDouble("offer", first.optDouble("suggested_price", 0));
            String title = fresh.size() > 1 ? fresh.size() + " solicitudes nuevas" : "Nueva solicitud";
            String text = pickup + " → " + delivery;
            if (price > 0) text += " · " + formatGuaranies(price) + " Gs.";
            RequestNotifier.notifyRequest(this, count, title, text);
        }
    }

    private String refreshAccessToken(SharedPreferences prefs) {
        HttpURLConnection connection = null;
        try {
            String supabaseUrl = prefs.getString(KEY_SUPABASE_URL, "");
            String supabaseKey = prefs.getString(KEY_SUPABASE_KEY, "");
            String refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "");
            if (supabaseUrl.isEmpty() || supabaseKey.isEmpty() || refreshToken.isEmpty()) return null;

            URL url = new URL(supabaseUrl.replaceAll("/+$", "") + "/auth/v1/token?grant_type=refresh_token");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", supabaseKey);
            JSONObject payload = new JSONObject().put("refresh_token", refreshToken);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }
            if (connection.getResponseCode() != 200) return null;

            JSONObject json = new JSONObject(read(connection.getInputStream()));
            String accessToken = json.optString("access_token", "");
            if (accessToken.isEmpty()) return null;
            String nextRefresh = json.optString("refresh_token", refreshToken);
            prefs.edit()
                    .putString(KEY_ACCESS_TOKEN, accessToken)
                    .putString(KEY_REFRESH_TOKEN, nextRefresh)
                    .apply();
            return accessToken;
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String apiBase(SharedPreferences prefs) {
        return prefs.getString(KEY_API_BASE, "").replaceAll("/+$", "");
    }

    private static String read(InputStream input) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private static String formatGuaranies(double value) {
        long amount = Math.round(value);
        return String.format(java.util.Locale.US, "%,d", amount).replace(',', '.');
    }

    private static final class PollResult {
        final boolean ok;
        final boolean unauthorized;
        final List<JSONObject> orders;

        private PollResult(boolean ok, boolean unauthorized, List<JSONObject> orders) {
            this.ok = ok;
            this.unauthorized = unauthorized;
            this.orders = orders;
        }

        static PollResult ok(List<JSONObject> orders) { return new PollResult(true, false, orders); }
        static PollResult unauthorized() { return new PollResult(false, true, new ArrayList<>()); }
    }
}
