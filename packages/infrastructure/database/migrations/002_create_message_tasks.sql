-- 002_create_message_tasks.sql
CREATE TABLE message_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  task_kind TEXT NOT NULL CHECK (task_kind IN ('TRANSLATE', 'SUMMARIZE')),
  target_language VARCHAR(10),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX message_tasks_pending_idx ON message_tasks(status) WHERE status = 'PENDING';
CREATE INDEX message_tasks_message_id_idx ON message_tasks(message_id);
