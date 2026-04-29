/**
 * Capacitor Background Geolocation wrapper.
 *
 * - On web browsers: all functions are no-ops. Zero impact on existing behavior.
 * - Inside the APK (Capacitor native): starts a Foreground Service that keeps
 *   GPS alive even when the screen is off or the user switches to Google Maps.
 *
 * Dynamic imports are used so web bundles are not affected by this file.
 */

type LocationCallback = (lat: number, lng: number) => void;

/**
 * Starts the background GPS watcher.
 * Returns a cleanup function, or null if not running inside the Capacitor APK.
 */
export async function startBackgroundGeo(
  onLocation: LocationCallback,
): Promise<(() => void) | null> {
  try {
    // Guard: only activate inside Capacitor native runtime (APK).
    // In web browsers Capacitor.isNativePlatform() returns false.
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;

    const { BackgroundGeolocation } = await import(
      '@capacitor-community/background-geolocation'
    );

    const watcherId = await BackgroundGeolocation.addWatcher(
      {
        // Notification shown in Android status bar while tracking is active
        backgroundMessage: 'TukiTask está usando tu ubicación en segundo plano.',
        backgroundTitle: 'TukiTask activo',
        requestPermissions: true,
        stale: false,
        // Only fire callback when driver moved at least 15 m (reduces battery use)
        distanceFilter: 15,
      },
      (location, error) => {
        if (error || !location) return;
        onLocation(location.latitude, location.longitude);
      },
    );

    // Return cleanup so the caller can stop the watcher on unmount
    return () => {
      BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
    };
  } catch {
    // If the plugin is missing (e.g. browser build) fail silently
    return null;
  }
}
