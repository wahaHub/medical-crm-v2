-- 003c_m0_indexes.sql
-- Runs OUTSIDE a transaction (migration runner detects CONCURRENTLY keyword).
-- IF NOT EXISTS makes each statement individually idempotent — safe partial re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_user_updated ON cases(patient_id, updated_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_assignment_stage_created ON cases(assignment_status, treatment_stage, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_assigned_hospital_created ON cases(assigned_hospital_id, created_at DESC) WHERE assigned_hospital_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_risk_flags_gin ON cases USING gin(risk_flags);
