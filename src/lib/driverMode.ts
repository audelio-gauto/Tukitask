import { Capacitor, registerPlugin } from '@capacitor/core';

interface DriverModePlugin {
  setEnabled(opts: { enabled: boolean }): Promise<void>;
  setBubble(opts: { enabled: boolean }): Promise<void>;
  getVersion(): Promise<{ versionCode: number }>;
  downloadUpdate(opts: { url: string }): Promise<void>;
  hasOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
}

const DriverMode = registerPlugin<DriverModePlugin>('DriverMode');

const ASKED_KEY = 'tuki_overlay_asked';

/** Solo en el APK: pantalla siempre encendida + burbuja flotante al salir a otras apps. */
export async function enableDriverMode(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await DriverMode.setEnabled({ enabled: true });
    const { granted } = await DriverMode.hasOverlayPermission();
    if (!granted && !localStorage.getItem(ASKED_KEY)) {
      localStorage.setItem(ASKED_KEY, '1');
      await DriverMode.requestOverlayPermission();
    }
  } catch { /* el plugin nativo no está en este APK */ }
}

/** Burbuja flotante: solo cuando el conductor está disponible. */
export async function setDriverBubble(enabled: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try { await DriverMode.setBubble({ enabled }); } catch { /* sin plugin */ }
}

/** Devuelve la URL del APK nuevo si hay una versión mayor a la instalada (solo Android). */
export async function checkAppUpdate(): Promise<string | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  try {
    const { versionCode } = await DriverMode.getVersion();
    const res = await fetch('/app-update/version.json', { cache: 'no-store' });
    const data = await res.json();
    return Number(data.versionCode) > versionCode && typeof data.url === 'string' ? data.url : null;
  } catch { return null; }
}

export async function downloadAppUpdate(url: string): Promise<void> {
  try { await DriverMode.downloadUpdate({ url }); } catch { /* sin plugin */ }
}

export async function disableDriverMode(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try { await DriverMode.setEnabled({ enabled: false }); } catch { /* sin plugin */ }
}
