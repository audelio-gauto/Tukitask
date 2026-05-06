-- Migration 055: Performance indexes from Index Advisor analysis (06 May 2026)
-- Addresses the two most-called queries flagged by index_advisor.
-- All indexes use IF NOT EXISTS — safe to re-run.

-- Recommended by index_advisor (2 separate queries both flagged this):
-- orders joined with order_stops — WHERE order_stops.order_id = orders.id
CREATE INDEX IF NOT EXISTS idx_order_stops_order_id
  ON public.order_stops USING btree (order_id);

-- Not flagged by advisor but 4,694 calls/session filtering by user_email:
-- notifications — WHERE notifications.user_email = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_user_email_created
  ON public.notifications USING btree (user_email, created_at DESC);
