import { Capacitor, registerPlugin } from '@capacitor/core';

interface DriverSessionPayload {
  apiBase: string;
  accessToken: string;
  refreshToken: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface NotificationPermissionResult {
  granted: boolean;
}

interface DriverModePlugin {
  setEnabled(opts: { enabled: boolean }): Promise<void>;
  setBubble(opts: { enabled: boolean }): Promise<void>;
  setBubbleBadge(opts: { count: number }): Promise<void>;
  setSession(opts: DriverSessionPayload): Promise<void>;
  clearSession(): Promise<void>;
  setNativeLocation(opts: { lat: number; lng: number }): Promise<void>;
  notifyRequests(opts: { count: number; title?: string; body?: string }): Promise<void>;
  clearRequestsNotification(): Promise<void>;
  hasNotificationPermission(): Promise<NotificationPermissionResult>;
  requestNotificationPermission(): Promise<NotificationPermissionResult>;
  getVersion(): Promise<{ versionCode: number }>;
  downloadUpdate(opts: { url: string }): Promise<void>;
  hasOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
}

const DriverMode = registerPlugin<DriverModePlugin>('DriverMode');

const ASKED_KEY = 'tuki_overlay_asked';
const NOTIF_ASKED_KEY = 'tuki_notif_asked';

function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Solo en el APK: pantalla siempre encendida + burbuja flotante al salir a otras apps. */
export async function enableDriverMode(): Promise<void> {
  if (!isAndroid()) return;
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
  if (!isAndroid()) return;
  try { await DriverMode.setBubble({ enabled }); } catch { /* sin plugin */ }
}

/** Insignia roja con la cantidad de solicitudes sobre la burbuja. */
export async function setDriverBubbleBadge(count: number): Promise<void> {
  if (!isAndroid()) return;
  try { await DriverMode.setBubbleBadge({ count }); } catch { /* sin plugin */ }
}

/** Guarda la sesión para que el APK pueda buscar solicitudes en segundo plano. */
export async function saveDriverSession(payload: DriverSessionPayload): Promise<void> {
  if (!isAndroid()) return;
  try { await DriverMode.setSession(payload); } catch { /* sin plugin */ }
}

/** Borra la sesión y detiene la búsqueda en segundo plano. */
export async function clearDriverSession(): Promise<void> {
  if (!isAndroid()) return;
  try {
    await DriverMode.clearSession();
    await DriverMode.clearRequestsNotification();
    await DriverMode.setBubbleBadge({ count: 0 });
  } catch { /* sin plugin */ }
}

/** Última ubicación conocida para el heartbeat nativo en segundo plano. */
export async function updateDriverNativeLocation(lat: number, lng: number): Promise<void> {
  if (!isAndroid()) return;
  try { await DriverMode.setNativeLocation({ lat, lng }); } catch { /* sin plugin */ }
}

/** Notificación local de solicitud (funciona aunque la app esté en otra app). */
export async function notifyDriverRequests(payload: {
  count: number;
  title?: string;
  body?: string;
}): Promise<void> {
  if (!isAndroid()) return;
  try { await DriverMode.notifyRequests(payload); } catch { /* sin plugin */ }
}

export async function clearDriverRequestsNotification(): Promise<void> {
  if (!isAndroid()) return;
  try { await DriverMode.clearRequestsNotification(); } catch { /* sin plugin */ }
}

/**
 * Pide permiso de notificaciones Android 13+ una sola vez.
 * Sin permiso la burbuja sigue, pero las solicitudes no generan aviso visible.
 */
export async function ensureDriverNotificationPermission(): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const current = await DriverMode.hasNotificationPermission();
    if (current.granted) return true;
    if (localStorage.getItem(NOTIF_ASKED_KEY) === '1') return false;
    localStorage.setItem(NOTIF_ASKED_KEY, '1');
    const result = await DriverMode.requestNotificationPermission();
    return result.granted === true;
  } catch {
    return false;
  }
}

/** Devuelve la URL del APK nuevo si hay una versión mayor a la instalada (solo Android). */
export async function checkAppUpdate(): Promise<string | null> {
  if (!isAndroid()) return null;
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
  if (!isAndroid()) return;
  try { await DriverMode.setEnabled({ enabled: false }); } catch { /* sin plugin */ }
}
