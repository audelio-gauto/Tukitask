-- Migration 049: Add new feed/thread tables to Supabase Realtime publication
--
-- Without this, postgres_changes subscriptions on driver_feed, tecnico_feed,
-- and chat_threads will NEVER fire — frontend would be deaf to new events.
--
-- Run AFTER 046, 047, 048.

ALTER PUBLICATION supabase_realtime ADD TABLE driver_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE tecnico_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_threads;
