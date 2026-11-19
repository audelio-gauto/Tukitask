package com.tukitask.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.view.WindowManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Puente JS ↔ nativo para el modo conductor: burbuja flotante, pantalla
 * siempre encendida y búsqueda de solicitudes en segundo plano.
 */
@CapacitorPlugin(
    name = "DriverMode",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class DriverModePlugin extends Plugin {
    static volatile boolean keepAwake = false;

    @PluginMethod
    public void setEnabled(final PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        keepAwake = enabled;
        if (!enabled) {
            BubbleManager.setEnabled(getContext(), false);
            DriverBackgroundService.stop(getContext());
            RequestNotifier.clear(getContext());
            BubbleManager.setBadge(getContext(), 0);
        }
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (getActivity() == null) { call.resolve(); return; }
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (!enabled) BubbleManager.hide(getContext().getApplicationContext());
            call.resolve();
        });
    }

    /** La burbuja solo se muestra mientras el conductor está disponible. */
    @PluginMethod
    public void setBubble(final PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        BubbleManager.setEnabled(getContext(), enabled);
        if (enabled) {
            // Se inicia mientras la app está en primer plano: Android no permite
            // arrancar el servicio en segundo plano más tarde.
            DriverBackgroundService.start(getContext());
        } else {
            DriverBackgroundService.stop(getContext());
            RequestNotifier.clear(getContext());
            BubbleManager.setBadge(getContext(), 0);
            if (getActivity() == null) {
                BubbleManager.hide(getContext().getApplicationContext());
            } else {
                getActivity().runOnUiThread(() -> BubbleManager.hide(getContext().getApplicationContext()));
            }
        }
        call.resolve();
    }

    /** Insignia roja con la cantidad de solicitudes pendientes. */
    @PluginMethod
    public void setBubbleBadge(final PluginCall call) {
        BubbleManager.setBadge(getContext(), call.getInt("count", 0));
        call.resolve();
    }

    /** Guarda la sesión y los datos de Supabase para refrescar el token en segundo plano. */
    @PluginMethod
    public void setSession(final PluginCall call) {
        String apiBase = trimSlash(call.getString("apiBase", ""));
        String accessToken = call.getString("accessToken", "");
        String refreshToken = call.getString("refreshToken", "");
        String supabaseUrl = trimSlash(call.getString("supabaseUrl", ""));
        String supabaseAnonKey = call.getString("supabaseAnonKey", "");
        String role = call.getString("role", DriverBackgroundService.ROLE_DRIVER);
        if (!DriverBackgroundService.ROLE_TECNICO.equals(role)) {
            role = DriverBackgroundService.ROLE_DRIVER;
        }
        if (apiBase.isEmpty() || accessToken == null || accessToken.isEmpty()) {
            call.reject("sesión inválida");
            return;
        }

        SharedPreferences prefs = sessionPrefs();
        String previousRole = prefs.getString(
                DriverBackgroundService.KEY_ROLE, DriverBackgroundService.ROLE_DRIVER);
        if (!role.equals(previousRole)) {
            // No mezclar solicitudes vistas por un rol con las del otro.
            prefs.edit().putString(DriverBackgroundService.KEY_KNOWN_IDS, "").apply();
        }

        prefs.edit()
                .putString(DriverBackgroundService.KEY_API_BASE, apiBase)
                .putString(DriverBackgroundService.KEY_ACCESS_TOKEN, accessToken)
                .putString(DriverBackgroundService.KEY_REFRESH_TOKEN, refreshToken == null ? "" : refreshToken)
                .putString(DriverBackgroundService.KEY_SUPABASE_URL, supabaseUrl)
                .putString(DriverBackgroundService.KEY_SUPABASE_KEY, supabaseAnonKey == null ? "" : supabaseAnonKey)
                .putString(DriverBackgroundService.KEY_ROLE, role)
                .apply();

        if (BubbleManager.isEnabled()) DriverBackgroundService.start(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearSession(final PluginCall call) {
        sessionPrefs().edit().clear().apply();
        DriverBackgroundService.stop(getContext());
        BubbleManager.setEnabled(getContext(), false);
        RequestNotifier.clear(getContext());
        BubbleManager.setBadge(getContext(), 0);
        call.resolve();
    }

    /** Última coordenada conocida para el heartbeat en segundo plano. */
    @PluginMethod
    public void setNativeLocation(final PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        if (lat == null || lng == null) {
            call.reject("coordenadas inválidas");
            return;
        }
        sessionPrefs().edit()
                .putString(DriverBackgroundService.KEY_LAT, String.valueOf(lat))
                .putString(DriverBackgroundService.KEY_LNG, String.valueOf(lng))
                .apply();
        call.resolve();
    }

    /** Notificación local inmediata (heads-up) con la nueva solicitud. */
    @PluginMethod
    public void notifyRequests(final PluginCall call) {
        int count = call.getInt("count", 1);
        String title = call.getString("title", "Nueva solicitud");
        String body = call.getString("body", "Tienes una solicitud cerca de ti");
        RequestNotifier.notifyRequest(getContext(), count, title, body);
        BubbleManager.setBadge(getContext(), count);
        call.resolve();
    }

    @PluginMethod
    public void clearRequestsNotification(final PluginCall call) {
        RequestNotifier.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void hasNotificationPermission(final PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", notificationsEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(final PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationsEnabled()) {
            JSObject result = new JSObject();
            result.put("granted", notificationsEnabled());
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", notificationsEnabled());
        call.resolve(result);
    }

    private boolean notificationsEnabled() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            int state = ContextCompat.checkSelfPermission(
                    getContext(), Manifest.permission.POST_NOTIFICATIONS);
            if (state != PackageManager.PERMISSION_GRANTED) return false;
        }
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private SharedPreferences sessionPrefs() {
        return getContext().getSharedPreferences(
                DriverBackgroundService.PREFS, android.content.Context.MODE_PRIVATE);
    }

    private static String trimSlash(String value) {
        if (value == null) return "";
        return value.replaceAll("/+$", "");
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            android.content.pm.PackageInfo p = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("versionCode", android.os.Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("version");
        }
    }

    /** Abre la descarga del APK nuevo en el navegador del sistema para instalarlo. */
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("url"); return; }
        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
        i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void hasOverlayPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", BubbleManager.canDraw(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (!BubbleManager.canDraw(getContext())) {
            getActivity().startActivity(BubbleManager.permissionIntent(getContext()));
        }
        call.resolve();
    }
}
