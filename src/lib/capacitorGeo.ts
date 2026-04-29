/**
 * Capacitor Background Geolocation wrapper.
 *
 * - On web browsers: no-op. Zero impact on existing behavior, zero build errors.
 * - Inside the APK (Capacitor native): accesses BackgroundGeolocation via
 *   window.Capacitor.Plugins (injected by the Android native bridge at runtime).
 *   This avoids importing the npm package entirely, so Next.js/webpack never
 *   tries to bundle a native-only module.
 *
 * When running inside the APK the Capacitor bridge injects all registered
 * plugins into window.Capacitor.Plugins before the WebView executes any JS.
 */

type LocationCallback = (lat: number, lng: number) => void;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (location: any, error: any) => {
        if (error || !location) return;
        onLocation(location.latitude, location.longitude);
      },
    );

    // Return cleanup so the caller can stop the watcher on unmount
    return () => {
      BackgroundGeolocation.removeWatcher({ id: watcherId }).catch?.(() => {});
    };
  } catch {
    // Fail silently — never break the web app
    return null;
  }
}
