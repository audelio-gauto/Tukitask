package com.tukitask.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** La WebView visible ya atiende solicitudes y heartbeat; el servicio espera. */
    private static volatile boolean visible = false;

    public static boolean isVisible() {
        return visible;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriverModePlugin.class);
        super.onCreate(savedInstanceState);
        // Recupera la burbuja/servicio que el conductor dejó activos antes de
        // que Android cerrara la app.
        BubbleManager.init(getApplicationContext());
    }

    // Al pasar a segundo plano (Google Maps/Waze, Home) aparece la burbuja; al volver desaparece.
    @Override
    public void onStop() {
        super.onStop();
        visible = false;
        if (BubbleManager.isEnabled()) {
            BubbleManager.show(getApplicationContext());
            // Normalmente ya está en marcha desde que el conductor se puso online.
            DriverBackgroundService.start(getApplicationContext());
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        visible = true;
        BubbleManager.hide(getApplicationContext());
        RequestNotifier.clear(getApplicationContext());
        // Arrancarlo con la app visible evita las restricciones de Android 12+
        // a iniciar servicios en segundo plano.
        if (BubbleManager.isEnabled()) DriverBackgroundService.start(getApplicationContext());
    }

    // Reaplica la pantalla encendida cada vez que la app vuelve al frente
    @Override
    public void onResume() {
        super.onResume();
        if (DriverModePlugin.keepAwake) {
            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }
}
