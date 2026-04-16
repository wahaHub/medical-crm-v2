DO $$
BEGIN
  CREATE TYPE "PatientSite" AS ENUM ('beauty', 'china');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS patient_site "PatientSite";

UPDATE users
SET patient_site = 'china'
WHERE role = 'PATIENT'
  AND patient_site IS NULL;

DROP INDEX IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_patient_email_site_key
  ON users USING btree (email text_ops, patient_site)
  WHERE role = 'PATIENT';

CREATE UNIQUE INDEX IF NOT EXISTS users_non_patient_email_key
  ON users USING btree (email text_ops)
  WHERE role <> 'PATIENT';

CREATE INDEX IF NOT EXISTS users_patient_site_idx
  ON users USING btree (patient_site);
