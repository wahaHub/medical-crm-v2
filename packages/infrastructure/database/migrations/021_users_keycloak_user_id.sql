-- Add keycloak_user_id to users for stable Keycloak -> CRM identity mapping.
-- Safe to run on databases that already have the column/index.
-- Backfill hospital users from hospital_registration_tokens when possible.
-- Admin users are NOT backfilled here because there is no DB-side source of truth.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS keycloak_user_id VARCHAR(100);

WITH latest_tokens AS (
  SELECT DISTINCT ON (email, hospital_id)
    email,
    hospital_id,
    keycloak_user_id
  FROM hospital_registration_tokens
  WHERE keycloak_user_id IS NOT NULL
  ORDER BY email, hospital_id, used_at DESC NULLS LAST
)
UPDATE users AS u
SET keycloak_user_id = lt.keycloak_user_id
FROM latest_tokens AS lt
WHERE u.role = 'HOSPITAL'
  AND u.keycloak_user_id IS NULL
  AND u.email = lt.email
  AND u.hospital_id IS NOT DISTINCT FROM lt.hospital_id;

CREATE UNIQUE INDEX IF NOT EXISTS users_keycloak_user_id_key
  ON users (keycloak_user_id)
  WHERE keycloak_user_id IS NOT NULL;
