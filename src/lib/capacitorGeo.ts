/**
 * Capacitor Background Geolocation wrapper.
 *
 * - On web browsers: no-op. Zero impact on existing behavior, zero build errors.
 * - Inside the APK (Capacitor native): accesses BackgroundGeolocation via
 *   window.Capacitor.Plugins (injected by the Android native bridge at runtime).
 *   Only types are imported from the package; the native module is not bundled.
 *
 * When running inside the APK the Capacitor bridge injects all registered
 * plugins into window.Capacitor.Plugins before the WebView executes any JS.
 */

import type { Location } from '@capacitor-community/background-geolocation';

type LocationCallback = (lat: number, lng: number, location: Location) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlugin = Record<string, (...args: any[]) => any>;

/**
 * Starts the background GPS watcher.
 * Returns a cleanup function, or null if not running inside the Capacitor APK.
 */
export async function startBackgroundGeo(
  onLocation: LocationCallback,
): Promise<(() => void) | null> {
  try {
    if (typeof window === 'undefined') return null;

    // window.Capacitor is only present inside the native APK WebView.
    // On regular browsers this object does not exist → safe no-op.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return null;

    const BackgroundGeolocation: AnyPlugin | undefined =
      cap.Plugins?.BackgroundGeolocation;
    if (!BackgroundGeolocation) return null;

    const watcherId: string = await BackgroundGeolocation.addWatcher(
      {
        // Notification shown in Android status bar while tracking is active
        backgroundMessage: 'TukiTask está usando tu ubicación en segundo plano.',
        backgroundTitle: 'TukiTask activo',
        requestPermissions: true,
        stale: false,
        // Fire callback only when driver moved ≥ 15 m (reduces battery use)
        distanceFilter: 15,
      },
      (location: Location | undefined, error: Error | undefined) => {
        if (error) { console.warn('[GPS] Error de ubicación en segundo plano:', error.message); return; }
        if (!location) return;
        onLocation(location.latitude, location.longitude, location);
      },
    );

    // Return cleanup so the caller can stop the watcher on unmount
    return () => {
      BackgroundGeolocation.removeWatcher({ id: watcherId }).catch?.((error: unknown) =>
        console.warn('[GPS] No se pudo detener la ubicación en segundo plano:', error));
    };
  } catch (error) {
    console.warn('[GPS] No se pudo iniciar la ubicación en segundo plano:', error);
    return null;
  }
}
