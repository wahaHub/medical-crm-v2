-- Add notification_settings JSONB column to users table.
-- Stores per-user notification preferences.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_settings JSONB;
