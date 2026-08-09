/* ── TukiMarket — shared types ───────────────────────────── */

export interface DbProduct {
  id: string;
  vendor_id: string;
  vendor_email: string;
  name: string;
  category: string;
  price: number;
  floor_price: number;
  stock: number;
  image: string | null;
  short_description: string | null;
  negotiable: boolean;
  avg_rating?: number | null;
  review_count?: number;
}
