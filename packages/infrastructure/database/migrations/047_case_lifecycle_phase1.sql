-- Case Lifecycle Phase 1: manual case creation, lifecycle board, stage-tagged documents, admin notes.
-- All changes are additive/nullable; existing chatbot/onboarding/upload flows are unaffected.

-- 1. users: whatsapp column + nullable email (offline-channel patients may have no email)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp text;

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

-- Re-create the partial unique indexes so they only enforce uniqueness when email is present.
-- Existing rows all have non-null, unique emails, so the rebuild cannot fail on current data.
DROP INDEX IF EXISTS users_patient_email_site_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_patient_email_site_key
  ON users (email, patient_site)
  WHERE role = 'PATIENT' AND email IS NOT NULL;

DROP INDEX IF EXISTS users_non_patient_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_non_patient_email_key
  ON users (email)
  WHERE role <> 'PATIENT' AND email IS NOT NULL;

-- 2. cases: source channel + creating admin
DO $$
BEGIN
  CREATE TYPE "CaseSourceChannel" AS ENUM ('WEB_ONBOARDING', 'MANUAL', 'EMAIL', 'WHATSAPP', 'PHONE_CALL', 'REFERRAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS source_channel "CaseSourceChannel";

-- Backfill: every existing case came from the website onboarding flow
UPDATE cases SET source_channel = 'WEB_ONBOARDING' WHERE source_channel IS NULL;

ALTER TABLE cases
  ALTER COLUMN source_channel SET DEFAULT 'WEB_ONBOARDING';

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid;

ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_created_by_admin_id_fkey;
ALTER TABLE cases
  ADD CONSTRAINT cases_created_by_admin_id_fkey
  FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- 3. documents: optional stage tag for archiving materials by treatment stage
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS stage_tag text;

-- 4. case event type: ADMIN_NOTE (pure append; new value is only used after this migration commits)
ALTER TYPE "CaseEventType" ADD VALUE IF NOT EXISTS 'ADMIN_NOTE';
