-- 003_m0_case_realignment.sql
-- Section 0: Add new case assignment/treatment model
-- This file runs INSIDE a transaction (safe rollback on failure)

-- New enums
CREATE TYPE "CaseAssignmentStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED');
CREATE TYPE "CaseTreatmentStage" AS ENUM ('CONFIRMED', 'IN_TREATMENT', 'POST_TREATMENT', 'COMPLETED', 'FOLLOW_UP');

-- Add new columns to cases
ALTER TABLE cases ADD COLUMN assignment_status "CaseAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED';
ALTER TABLE cases ADD COLUMN treatment_stage "CaseTreatmentStage";
ALTER TABLE cases ADD COLUMN condition_summary TEXT;
ALTER TABLE cases ADD COLUMN structured_data JSONB;
ALTER TABLE cases ADD COLUMN risk_flags TEXT[];
ALTER TABLE cases ADD COLUMN priority VARCHAR(20);
ALTER TABLE cases ADD COLUMN last_event_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN ai_summary_status "AISummaryStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE cases ADD COLUMN question_collector_template_id UUID;

-- Backfill: map old status/stage → new assignment_status/treatment_stage
UPDATE cases SET assignment_status = 'ASSIGNED' WHERE assigned_hospital_id IS NOT NULL;
UPDATE cases SET treatment_stage = 'CONFIRMED' WHERE stage = 'HOSPITAL_CONTACTED' AND assigned_hospital_id IS NOT NULL;
UPDATE cases SET treatment_stage = 'IN_TREATMENT' WHERE stage = 'IN_TREATMENT';
UPDATE cases SET treatment_stage = 'COMPLETED' WHERE stage = 'TREATMENT_COMPLETED';
