export type DriverLookupStatus = 'loading' | 'error' | 'ready';

export function vehicleAvailability(
  status: DriverLookupStatus,
  eta: number | null | undefined,
): { available: boolean; label: string } {
  if (status === 'loading') return { available: false, label: 'Buscando conductores…' };
  if (status === 'error') return { available: false, label: 'No se pudo comprobar disponibilidad' };
  if (eta == null || !Number.isFinite(eta) || eta <= 0) {
    return { available: false, label: 'Sin conductores cerca' };
  }
  return { available: true, label: `${eta} min` };
}
