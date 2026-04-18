-- Track notification email cooldown windows so repeated updates do not spam users.

CREATE TABLE IF NOT EXISTS email_notification_cooldowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  notification_kind varchar(80) NOT NULL,
  dedupe_key varchar(255) NOT NULL,
  last_sent_at timestamp(6) NOT NULL,
  created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS email_notification_cooldowns_recipient_idx
  ON email_notification_cooldowns (recipient_id);

CREATE INDEX IF NOT EXISTS email_notification_cooldowns_kind_idx
  ON email_notification_cooldowns (notification_kind);

CREATE UNIQUE INDEX IF NOT EXISTS email_notification_cooldowns_unique_slot_key
  ON email_notification_cooldowns (recipient_id, notification_kind, dedupe_key);
