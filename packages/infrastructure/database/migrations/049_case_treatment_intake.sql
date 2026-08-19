-- Case Lifecycle: add INTAKE as the initial treatment stage.
-- NOTE: the new enum value is only usable after this migration commits,
-- so the backfill lives in 050_case_treatment_intake_backfill.sql.
ALTER TYPE "CaseTreatmentStage" ADD VALUE IF NOT EXISTS 'INTAKE';
