// ─── Roles ────────────────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN: 'admin',
  DRIVER: 'driver',
  CLIENTE: 'cliente',
  TECNICO: 'tecnico',
  SERVICIO: 'servicio',
  HOTELERIA: 'hoteleria',
  VENDEDOR: 'vendedor',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ADMIN_ROLES: string[] = ['admin', 'super_admin', 'owner'];

// ─── Order statuses ───────────────────────────────────────────────────────────
export const ORDER_STATUS = {
  PENDING: 'pending',
  NEGOTIATING: 'negotiating',
  ACCEPTED: 'accepted',
  PICKING_UP: 'picking_up',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RETURNING: 'returning',
  DRIVER_RETURNING: 'driver_returning',
  RETURN_DELIVERED: 'return_delivered',
  RETURN_REJECTED: 'return_rejected',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
  INCIDENT_CLOSED: 'incident_closed',
  CLIENT_CONFIRMED: 'client_confirmed',
  COMMISSION_CHARGED: 'commission_charged',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

// Active order statuses a driver works with
export const DRIVER_ACTIVE_STATUSES: OrderStatus[] = [
  'accepted', 'picking_up', 'in_transit',
  'returning', 'driver_returning', 'return_delivered', 'return_rejected',
];

export const DRIVER_HISTORY_STATUSES: OrderStatus[] = [
  'delivered', 'cancelled', 'returned', 'return_rejected',
];

// ─── Tecnico job statuses ─────────────────────────────────────────────────────
export const JOB_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EN_CAMINO: 'en_camino',
  LLEGUE: 'llegue',
  EN_PROCESO: 'en_proceso',
  COMPLETION_PENDING: 'completion_pending',
  COMPLETADO: 'completado',
  CANCELLED: 'cancelled',
  INCIDENTE: 'incidente',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export const JOB_ACTIVE_STATUSES: JobStatus[] = [
  'accepted', 'en_camino', 'llegue', 'en_proceso', 'completion_pending',
];

export const JOB_HISTORY_STATUSES: JobStatus[] = [
  'completado', 'cancelled', 'incidente',
];

// ─── Offer statuses ───────────────────────────────────────────────────────────
export const OFFER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;

export type OfferStatus = (typeof OFFER_STATUS)[keyof typeof OFFER_STATUS];

// ─── Limits ───────────────────────────────────────────────────────────────────
export const PAGE_SIZE = 50;
export const MAX_FILE_SIZE_PHOTO = 2 * 1024 * 1024; // 2 MB
export const MAX_FILE_SIZE_AUDIO = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_AUDIO_TYPES = [
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/webm;codecs=opus',
] as const;
