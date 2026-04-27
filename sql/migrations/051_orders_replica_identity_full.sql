-- Migration 051: Enable REPLICA IDENTITY FULL on orders table
-- 
-- WHY: Supabase Realtime row-level filters (e.g. client_email=eq.X)
-- only work reliably on UPDATE events when the table has REPLICA IDENTITY FULL.
-- Without it, PostgreSQL's WAL only carries the PK for the old tuple, so
-- Supabase cannot match the filter column and the client never receives
-- UPDATE events (e.g. 'returning', 'driver_returning', etc.).
--
-- EFFECT: the client's mis-ofertas page will now receive realtime events
-- whenever an order status changes, fixing the issue where the return
-- request (status = 'returning') was not appearing for the client.

ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Also fix tecnico_jobs for the same reason (tecnico status changes)
ALTER TABLE public.tecnico_jobs REPLICA IDENTITY FULL;
