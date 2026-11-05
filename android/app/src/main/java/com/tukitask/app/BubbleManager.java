package com.tukitask.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

/**
 * Burbuja flotante (estilo Uber/Bolt) que aparece sobre otras apps cuando
 * TukiTask pasa a segundo plano (p. ej. al navegar con Google Maps o Waze).
 * Al tocarla vuelve a TukiTask.
 */
public final class BubbleManager {
    private static View bubble;
    private static WindowManager.LayoutParams params;
    private static boolean enabled = false;

    private BubbleManager() {}

    public static boolean isEnabled() { return enabled; }
    public static void setEnabled(boolean value) { enabled = value; }

    public static boolean canDraw(Context ctx) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx);
    }

    public static Intent permissionIntent(Context ctx) {
        return new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.getPackageName()));
    }

    public static void show(final Context appCtx) {
        if (!enabled || bubble != null || !canDraw(appCtx)) return;
        final WindowManager wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
        float d = appCtx.getResources().getDisplayMetrics().density;
        int size = (int) (60 * d);

        ImageView v = new ImageView(appCtx);
        int resId = appCtx.getResources().getIdentifier("ic_launcher_round", "mipmap", appCtx.getPackageName());
        v.setImageResource(resId);
        v.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.WHITE);
        bg.setStroke((int) (2 * d), Color.parseColor("#F5C518"));
        v.setBackground(bg);
        v.setClipToOutline(true);
        v.setElevation(8 * d);
        v.setPadding((int) (2 * d), (int) (2 * d), (int) (2 * d), (int) (2 * d));

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
        v.setOnTouchListener(new View.OnTouchListener() {
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
                            params.x = startX + (int) dx;
                            params.y = startY + (int) dy;
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
            wm.addView(v, params);
            bubble = v;
        } catch (Exception ignored) {
            bubble = null;
        }
    }

    public static void hide(Context appCtx) {
        if (bubble == null) return;
        try {
            ((WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE)).removeView(bubble);
        } catch (Exception ignored) {}
        bubble = null;
    }
}
