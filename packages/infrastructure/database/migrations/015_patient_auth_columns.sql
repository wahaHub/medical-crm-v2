-- Ensure patient-auth columns exist on users table.
-- This is safe to run on both old and new databases.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
