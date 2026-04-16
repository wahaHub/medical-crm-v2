DO $$
BEGIN
  CREATE TYPE "PatientSite" AS ENUM ('beauty', 'china');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS patient_site "PatientSite";

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS site "PatientSite";

UPDATE users
SET patient_site = 'china'
WHERE role = 'PATIENT'
  AND patient_site IS NULL;

UPDATE ai_chat_sessions
SET site = 'china'
WHERE site IS NULL;

ALTER TABLE ai_chat_sessions
  ALTER COLUMN site SET NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_patient_site_required;

ALTER TABLE users
  ADD CONSTRAINT users_patient_site_required
  CHECK (
    (role = 'PATIENT' AND patient_site IS NOT NULL)
    OR (role <> 'PATIENT' AND patient_site IS NULL)
  );

DROP INDEX IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_patient_email_site_key
  ON users USING btree (email text_ops, patient_site)
  WHERE role = 'PATIENT';

CREATE UNIQUE INDEX IF NOT EXISTS users_non_patient_email_key
  ON users USING btree (email text_ops)
  WHERE role <> 'PATIENT';

CREATE INDEX IF NOT EXISTS users_patient_site_idx
  ON users USING btree (patient_site);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_site_idx
  ON ai_chat_sessions USING btree (site);

CREATE OR REPLACE FUNCTION prevent_cross_role_user_email_duplicates()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'PATIENT' THEN
    IF EXISTS (
      SELECT 1
      FROM users
      WHERE email = NEW.email
        AND role <> 'PATIENT'
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'EMAIL_ROLE_CONFLICT';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM users
      WHERE email = NEW.email
        AND role = 'PATIENT'
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'EMAIL_ROLE_CONFLICT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_prevent_cross_role_email_duplicates ON users;

CREATE TRIGGER users_prevent_cross_role_email_duplicates
BEFORE INSERT OR UPDATE OF email, role, patient_site
ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_cross_role_user_email_duplicates();
