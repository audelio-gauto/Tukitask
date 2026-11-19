/**
 * Disponibilidad del técnico, compartida por el inicio y el layout.
 *
 * La burbuja flotante del APK y la búsqueda de solicitudes en segundo plano
 * dependen de este estado, igual que ocurre con el conductor. Se guarda en
 * localStorage para sobrevivir a la navegación y se notifica por evento para
 * que el layout reaccione aunque el técnico esté en otra pantalla de la app.
 */

const STORAGE_KEY = 'tecnico_available';
const EVENT_NAME = 'tuki:tecnico-availability';

let available = false;
let initialized = false;

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function ensureState(): boolean {
  if (!initialized) {
    available = readStored();
    initialized = true;
  }
  return available;
}

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { available } }));
  } catch {
    /* CustomEvent no disponible en entornos muy antiguos */
  }
}

export function getTecnicoAvailability(): boolean {
  return ensureState();
}

export function isTecnicoAvailable(): boolean {
  return ensureState();
}

export function setTecnicoAvailability(value: boolean): void {
  const previous = ensureState();
  available = value;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    } catch {
      /* almacenamiento no disponible */
    }
  }
  if (previous !== value) emit();
}

/** Suscribe a cambios de disponibilidad, incluidos los de otra pestaña. */
export function subscribeTecnicoAvailability(listener: (available: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ available?: boolean }>).detail;
    listener(typeof detail?.available === 'boolean' ? detail.available : getTecnicoAvailability());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    initialized = false;
    listener(getTecnicoAvailability());
  };

  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
