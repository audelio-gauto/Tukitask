-- Migration 048: Chat unread index for job-based threads

CREATE INDEX IF NOT EXISTS idx_chat_messages_job_unread
  ON chat_messages(job_id, sender_email, read_at)
  WHERE read_at IS NULL;
