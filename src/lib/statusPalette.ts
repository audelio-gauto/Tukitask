export type StatusTone = {
  color: string;
  bg: string;
  border: string;
};

const DEFAULT_TONE: StatusTone = {
  color: '#64748b',
  bg: 'rgba(100,116,139,0.12)',
  border: 'rgba(100,116,139,0.28)',
};

const GREEN: StatusTone = {
  color: '#22c55e',
  bg: 'rgba(34,197,94,0.12)',
  border: 'rgba(34,197,94,0.28)',
};

const BLUE: StatusTone = {
  color: '#3b82f6',
  bg: 'rgba(59,130,246,0.12)',
  border: 'rgba(59,130,246,0.28)',
};

const AMBER: StatusTone = {
  color: '#f59e0b',
  bg: 'rgba(245,158,11,0.12)',
  border: 'rgba(245,158,11,0.3)',
};

const ORANGE: StatusTone = {
  color: '#fb923c',
  bg: 'rgba(251,146,60,0.14)',
  border: 'rgba(251,146,60,0.3)',
};

const PURPLE: StatusTone = {
  color: '#a78bfa',
  bg: 'rgba(167,139,250,0.14)',
  border: 'rgba(167,139,250,0.3)',
};

const RED: StatusTone = {
  color: '#ef4444',
  bg: 'rgba(239,68,68,0.12)',
  border: 'rgba(239,68,68,0.28)',
};

const GRAY: StatusTone = {
  color: '#94a3b8',
  bg: 'rgba(148,163,184,0.12)',
  border: 'rgba(148,163,184,0.28)',
};

const STATUS_TONES: Record<string, StatusTone> = {
  pending: AMBER,
  negotiating: AMBER,
  'pending-job': AMBER,
  pending_job: AMBER,
  accepted: GREEN,
  assigned: GREEN,
  confirmed: GREEN,
  client_confirmed: GREEN,
  picking_up: BLUE,
  in_transit: BLUE,
  en_camino: BLUE,
  en_route: BLUE,
  llegue: AMBER,
  arrived: AMBER,
  en_proceso: ORANGE,
  in_progress: ORANGE,
  completion_pending: PURPLE,
  delivered: GREEN,
  completed: GREEN,
  completado: GREEN,
  commission_charged: GREEN,
  failed: RED,
  cancelled: RED,
  incidente: RED,
  incident_closed: RED,
  // Mandadito payment flow
  awaiting_payment: AMBER,
  payment_confirmed: GREEN,
  return_rejected: AMBER,
  rejected: RED,
  returning: AMBER,
  driver_returning: AMBER,
  return_delivered: AMBER,
  returned: AMBER,
  expired: GRAY,
};

export function getStatusTone(status: string): StatusTone {
  const key = (status || '').toLowerCase();
  return STATUS_TONES[key] ?? DEFAULT_TONE;
}
