import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tukitask.app',
  appName: 'TukiTask',
  // webDir is required by Capacitor CLI but not used when server.url is set
  webDir: 'public',
  server: {
    // APK loads the live Vercel deployment directly — no static export needed.
    // Updates to tukitask.vercel.app are instantly reflected in the APK.
    url: 'https://tukitask.vercel.app',
    cleartext: false,
  },
  android: {
    // Allow http-only within the WebView (Supabase/Vercel use https so this is not needed
    // but kept false for security)
    allowMixedContent: false,
    // Keep the screen on while the driver/tecnico session is active
    // (controlled by the app via Wake Lock API — no native setting needed here)
  },
  plugins: {
    // Background geolocation plugin config (Android only)
    // Options are passed in code via addWatcher(), not here
  },
};

export default config;
