/**
 * Shared domain types — single source of truth for all UI and API code.
 *
 * Import from any page or component:
 *   import type { Order, DriverOffer, Job, TecnicoOffer } from '@/types';
 */

/** A delivery order created by a client */
export interface Order {
  id: string;
  created_at: string;
  status: string;
  client_email: string;
  accepted_by: string | null;       // driver email
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  vehicle_type: string;
  pickup_address: string;
  delivery_address: string;
  suggested_price: number | null;
  offer: number | null;             // agreed price after negotiation
  sender_contact: string | null;
  sender_phone: string | null;
  sender_ref: string | null;
  sender_address: string | null;
  receiver_contact: string | null;
  receiver_phone: string | null;
  receiver_address: string | null;
  description: string | null;
  instructions: string | null;
  payment_method: string | null;
  package_type: string | null;
  // Multi-stop
  is_multi_stop: boolean;
  stop_count: number;
  order_stops?: OrderStop[];        // populated when joined
  // Mandaditos
  order_type: string;               // 'envio' | 'mandadito'
  shopping_list: string | null;
  max_budget: number | null;
  // Return flow
  fail_reason: string | null;
  return_reason: string | null;
  return_rejected_reason: string | null;
  returning_at: string | null;
  returned_at: string | null;
  incident_closed_at: string | null;
  return_attempts: number;
  // Geography
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  // Rating
  rate_score: number | null;
  rate_note: string | null;
  rated_at: string | null;
}

/** A single delivery stop within a multi-stop order */
export interface OrderStop {
  id: string;
  order_id: string;
  sequence: number;
  address: string;
  lat: number | null;
  lng: number | null;
  receiver_contact: string | null;
  receiver_phone: string | null;
  description: string | null;
  status: string;                   // pending | delivered | failed
  delivered_at: string | null;
  fail_reason: string | null;
  created_at: string;
}

/** A driver's price offer on a delivery order */
export interface DriverOffer {
  id: string;
  order_id: string;
  driver_email: string;
  driver_name: string | null;
  driver_photo: string | null;
  amount: number;
  status: string;                   // pending | accepted | rejected
  created_at: string;
  updated_at: string;
}

/** A service job created by a client and worked on by a tecnico */
export interface Job {
  id: string;
  created_at: string;
  status: string;
  service_type: string;
  client_name: string | null;
  client_email: string;
  client_rating: number | null;
  client_initial_price: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_at: string | null;
  agreed_price: number | null;
  extra_charge: number | null;
  total_price: number | null;
  description: string | null;
  audio_url: string | null;
  accepted_at: string | null;
  completion_attempts: number;
  last_rejection_reason: string | null;
  // Populated by joins/API enrichment
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  my_offer: number | null;          // current tecnico's pending offer amount, if any
}

/** A tecnico's offer on a service job */
export interface TecnicoOffer {
  id: string;
  tecnico_email: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  proposed_price: number;
  note: string | null;
  distance_km: number | null;
}
