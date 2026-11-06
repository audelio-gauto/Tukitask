package com.tukitask.app;

import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Puente JS ↔ nativo para el modo conductor: burbuja flotante y pantalla siempre encendida. */
@CapacitorPlugin(name = "DriverMode")
public class DriverModePlugin extends Plugin {
    static volatile boolean keepAwake = false;

    @PluginMethod
    public void setEnabled(final PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        keepAwake = enabled;
        if (!enabled) BubbleManager.setEnabled(false);
        getActivity().runOnUiThread(() -> {
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
        BubbleManager.setEnabled(enabled);
        if (!enabled) {
            getActivity().runOnUiThread(() -> BubbleManager.hide(getContext().getApplicationContext()));
        }
        call.resolve();
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
