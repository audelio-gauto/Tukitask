package com.tukitask.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriverModePlugin.class);
        super.onCreate(savedInstanceState);
    }

    // Al pasar a segundo plano (Google Maps/Waze, Home) aparece la burbuja; al volver desaparece
    @Override
    public void onStop() {
        super.onStop();
        BubbleManager.show(getApplicationContext());
    }

    @Override
    public void onStart() {
        super.onStart();
        BubbleManager.hide(getApplicationContext());
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
