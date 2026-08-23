/* ── TukiMarket — shared utilities ───────────────────────── */

export const gs = (n: number | null | undefined) => `Gs. ${(n ?? 0).toLocaleString('es-PY')}`;

export const PY_CITIES = [
  'Asunción','Fernando de la Mora','Lambaré','Luque','San Lorenzo',
  'Capiatá','Villa Elisa','Ita','Itauguá','Ypané','Mariano Roque Alonso',
  'Limpio','Areguá','Caacupé','Villarrica','Encarnación','Ciudad del Este',
  'Pedro Juan Caballero','Concepción','Coronel Oviedo',
];

export interface DeliveryCityConfig {
  city: string;
  shipping_price: number;
  cash_on_delivery: boolean;
  transfer: boolean;
}

export const DEFAULT_DELIVERY_CITIES: DeliveryCityConfig[] = PY_CITIES.slice(0, 6).map((city) => ({
  city,
  shipping_price: 25000,
  cash_on_delivery: true,
  transfer: true,
}));

/** Merge raw store config JSON with typed defaults — prevents crashes on missing fields */
export function parseStoreConfig<T extends object>(raw: unknown, defaults: T): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  return { ...defaults, ...(raw as Partial<T>) };
}
