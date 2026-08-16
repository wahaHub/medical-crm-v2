-- Case Lifecycle Phase 2: patient merge + case merge.
-- All changes are additive/nullable; enum values are pure appends. Existing
-- flows are unaffected: MERGED rows only ever appear after an explicit merge.

-- 1. users: soft-merge marker. A merged (secondary) patient keeps its row but
--    points at the surviving primary profile and is rejected at patient login.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS merged_into_user_id uuid;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_merged_into_user_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_merged_into_user_id_fkey
  FOREIGN KEY (merged_into_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_merged_into_user_id_idx
  ON users (merged_into_user_id);

-- 2. cases: soft-merge marker. A merged (secondary) case keeps its row with
--    status = 'MERGED' and points at the surviving primary case.
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS merged_into_case_id uuid;

ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_merged_into_case_id_fkey;
ALTER TABLE cases
  ADD CONSTRAINT cases_merged_into_case_id_fkey
  FOREIGN KEY (merged_into_case_id) REFERENCES cases(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cases_merged_into_case_id_idx
  ON cases (merged_into_case_id);

-- 3. Enum appends (pure additions; new values are only written after this migration commits)
ALTER TYPE "CaseStatus" ADD VALUE IF NOT EXISTS 'MERGED';
ALTER TYPE "CaseEventType" ADD VALUE IF NOT EXISTS 'PATIENT_MERGED';
ALTER TYPE "CaseEventType" ADD VALUE IF NOT EXISTS 'CASE_MERGED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'PATIENT_MERGED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'CASE_MERGED';
