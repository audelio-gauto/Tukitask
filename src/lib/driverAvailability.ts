/**
 * Estado de disponibilidad del conductor, compartido por el layout y el inicio.
 *
 * La burbuja flotante del APK y la recepción de solicitudes en segundo plano
 * dependen de este estado. Se guarda en localStorage para sobrevivir a la
 * navegación y se notifica por evento para que el layout reaccione al instante
 * aunque el conductor esté en otra pestaña de la app.
 */

export interface DriverAvailabilityState {
  /** El conductor activó el interruptor de disponibilidad. */
  available: boolean;
  /** La billetera está bloqueada: aunque el interruptor esté activo, no recibe. */
  walletBlocked: boolean;
}

const STORAGE_KEY = 'driver_available';
const EVENT_NAME = 'tuki:driver-availability';

let state: DriverAvailabilityState = { available: false, walletBlocked: false };
let initialized = false;

function readStoredAvailability(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function ensureState(): DriverAvailabilityState {
  if (!initialized) {
    state = { available: readStoredAvailability(), walletBlocked: false };
    initialized = true;
  }
  return state;
}

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { ...state } }));
  } catch {
    /* CustomEvent no disponible en entornos muy antiguos */
  }
}

export function getDriverAvailability(): DriverAvailabilityState {
  return { ...ensureState() };
}

/** Disponibilidad efectiva: online y sin bloqueo de billetera. */
export function isDriverAvailable(): boolean {
  const current = ensureState();
  return current.available && !current.walletBlocked;
}

export function setDriverAvailability(available: boolean): void {
  const current = ensureState();
  if (current.available === available) return;
  current.available = available;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, available ? 'true' : 'false');
    } catch {
      /* almacenamiento no disponible */
    }
  }
  emit();
}

export function setDriverWalletBlocked(walletBlocked: boolean): void {
  const current = ensureState();
  if (current.walletBlocked === walletBlocked) return;
  current.walletBlocked = walletBlocked;
  emit();
}

/**
 * Suscribe a cambios de disponibilidad. Devuelve la función para cancelar.
 * También escucha cambios de localStorage hechos desde otra pestaña.
 */
export function subscribeDriverAvailability(
  listener: (state: DriverAvailabilityState) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<DriverAvailabilityState>).detail;
    listener(detail ?? getDriverAvailability());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    initialized = false;
    listener(getDriverAvailability());
  };

  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
