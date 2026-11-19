package com.tukitask.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

/**
 * Burbuja flotante (estilo Uber/Bolt/InDrive) que aparece sobre otras apps
 * cuando TukiTask pasa a segundo plano (p. ej. al navegar con Google Maps o
 * Waze). Solo se muestra si el conductor está disponible.
 *
 * La insignia roja indica cuántas solicitudes hay esperando.
 */
public final class BubbleManager {
    private static final String PREFS = "tuki_driver_mode";
    private static final String KEY_BUBBLE = "bubble_enabled";

    private static View bubble;
    private static TextView badgeView;
    private static WindowManager.LayoutParams params;
    private static int badgeCount = 0;
    private static boolean enabled = false;

    private BubbleManager() {}

    public static void init(Context ctx) {
        enabled = prefs(ctx).getBoolean(KEY_BUBBLE, false);
    }

    public static boolean isEnabled() { return enabled; }

    public static void setEnabled(Context ctx, boolean value) {
        enabled = value;
        prefs(ctx).edit().putBoolean(KEY_BUBBLE, value).apply();
        if (!value) {
            badgeCount = 0;
            hide(ctx.getApplicationContext());
        }
    }

    public static boolean canDraw(Context ctx) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx);
    }

    public static Intent permissionIntent(Context ctx) {
        return new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.getPackageName()));
    }

    /** Actualiza la insignia de solicitudes pendientes. Seguro desde cualquier hilo. */
    public static void setBadge(final Context ctx, final int count) {
        badgeCount = Math.max(0, count);
        new Handler(Looper.getMainLooper()).post(() -> applyBadge(ctx));
    }

    private static void applyBadge(Context ctx) {
        if (badgeView == null) return;
        if (badgeCount <= 0) {
            badgeView.setVisibility(View.GONE);
            return;
        }
        badgeView.setText(badgeCount > 99 ? "99+" : String.valueOf(badgeCount));
        badgeView.setVisibility(View.VISIBLE);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void show(final Context appCtx) {
        if (!enabled || bubble != null || !canDraw(appCtx)) return;
        // WindowManager solo puede tocar vistas desde el hilo principal. El
        // puente de Capacitor puede invocar esto desde otro hilo.
        if (Looper.myLooper() != Looper.getMainLooper()) {
            new Handler(Looper.getMainLooper()).post(() -> show(appCtx));
            return;
        }
        final WindowManager wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
        float d = appCtx.getResources().getDisplayMetrics().density;
        int size = (int) (60 * d);

        ImageView icon = new ImageView(appCtx);
        int resId = appCtx.getResources().getIdentifier("ic_launcher_round", "mipmap", appCtx.getPackageName());
        if (resId == 0) resId = appCtx.getApplicationInfo().icon;
        icon.setImageResource(resId);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.WHITE);
        bg.setStroke((int) (2 * d), Color.parseColor("#F5C518"));
        icon.setBackground(bg);
        icon.setClipToOutline(true);
        icon.setPadding((int) (2 * d), (int) (2 * d), (int) (2 * d), (int) (2 * d));

        FrameLayout container = new FrameLayout(appCtx);
        container.setElevation(8 * d);
        container.setContentDescription("TukiTask: solicitudes pendientes");
        container.addView(icon, new FrameLayout.LayoutParams(size, size));

        TextView badge = new TextView(appCtx);
        badge.setTextColor(Color.WHITE);
        badge.setTextSize(11);
        badge.setGravity(Gravity.CENTER);
        badge.setTypeface(null, android.graphics.Typeface.BOLD);
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setShape(GradientDrawable.OVAL);
        badgeBg.setColor(Color.parseColor("#EF4444"));
        badgeBg.setStroke((int) (1.5 * d), Color.WHITE);
        badge.setBackground(badgeBg);
        int badgeSize = (int) (23 * d);
        FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(
                badgeSize, badgeSize, Gravity.TOP | Gravity.END);
        container.addView(badge, badgeParams);
        badgeView = badge;
        applyBadge(appCtx);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        params = new WindowManager.LayoutParams(size, size, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = (int) (12 * d);
        params.y = (int) (140 * d);

        final int slop = (int) (8 * d);
        container.setOnTouchListener(new View.OnTouchListener() {
            private int startX, startY;
            private float touchX, touchY;
            private boolean moved;

            @Override
            public boolean onTouch(View view, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = params.x; startY = params.y;
                        touchX = e.getRawX(); touchY = e.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - touchX, dy = e.getRawY() - touchY;
                        if (Math.abs(dx) > slop || Math.abs(dy) > slop) moved = true;
                        if (moved) {
                            int maxX = appCtx.getResources().getDisplayMetrics().widthPixels - size;
                            int maxY = appCtx.getResources().getDisplayMetrics().heightPixels - size;
                            params.x = Math.max(0, Math.min(maxX, startX + (int) dx));
                            params.y = Math.max(0, Math.min(maxY, startY + (int) dy));
                            try { wm.updateViewLayout(bubble, params); } catch (Exception ignored) {}
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            Intent i = new Intent(appCtx, MainActivity.class);
                            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                            appCtx.startActivity(i);
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        try {
            wm.addView(container, params);
            bubble = container;
        } catch (Exception ignored) {
            bubble = null;
            badgeView = null;
        }
    }

    public static void hide(final Context appCtx) {
        // Se postea siempre: puede haber un show pendiente en la cola principal.
        if (Looper.myLooper() != Looper.getMainLooper()) {
            new Handler(Looper.getMainLooper()).post(() -> hide(appCtx));
            return;
        }
        if (bubble == null) return;
        try {
            ((WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE)).removeView(bubble);
        } catch (Exception ignored) {}
        bubble = null;
        badgeView = null;
    }
}
