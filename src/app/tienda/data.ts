/* ── TukiMarket — shared utilities ───────────────────────── */

export const gs = (n: number | null | undefined) => `Gs. ${(n ?? 0).toLocaleString('es-PY')}`;

export const PY_CITIES = [
  'Asunción','Fernando de la Mora','Lambaré','Luque','San Lorenzo',
  'Capiatá','Villa Elisa','Ita','Itauguá','Ypané','Mariano Roque Alonso',
  'Limpio','Areguá','Caacupé','Villarrica','Encarnación','Ciudad del Este',
  'Pedro Juan Caballero','Concepción','Coronel Oviedo',
];

/** Merge raw store config JSON with typed defaults — prevents crashes on missing fields */
export function parseStoreConfig<T extends object>(raw: unknown, defaults: T): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  return { ...defaults, ...(raw as Partial<T>) };
}
