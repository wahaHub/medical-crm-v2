-- Minimal identity compatibility for the de-identified video staging API.
-- This file is intentionally outside database/migrations: production and the
-- full CRM bootstrap must never receive this synthetic operator.

DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'HOSPITAL', 'PATIENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255),
  name varchar(100) NOT NULL,
  role "UserRole" NOT NULL DEFAULT 'PATIENT',
  hospital_id uuid,
  status varchar(20) NOT NULL DEFAULT 'active',
  last_login_at timestamp(6),
  created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  keycloak_user_id varchar(100)
);

-- A previously interrupted full-bootstrap attempt may have created the base
-- table before later identity migrations ran. Converge that harmless partial
-- state as well as a genuinely empty database.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email varchar(255),
  ADD COLUMN IF NOT EXISTS hospital_id uuid,
  ADD COLUMN IF NOT EXISTS last_login_at timestamp(6),
  ADD COLUMN IF NOT EXISTS updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS keycloak_user_id varchar(100);

CREATE UNIQUE INDEX IF NOT EXISTS users_keycloak_user_id_key
  ON users (keycloak_user_id)
  WHERE keycloak_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS video_staging_users_normalized_email_key
  ON users (lower(email))
  WHERE email IS NOT NULL;

-- The first successful login from the isolated staging Keycloak realm binds
-- keycloak_user_id through authMiddleware's email fallback. The reserved
-- invalid.example address is synthetic and must exist only in that realm.
INSERT INTO users (id, email, name, role, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'video-staging-admin@invalid.example',
  'Video Staging Operator',
  'ADMIN',
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    updated_at = CURRENT_TIMESTAMP;
