-- Module 5: Journey + Milestones
-- Enum
CREATE TYPE "MilestoneEventType" AS ENUM (
  'FLIGHT_ARRIVAL', 'FLIGHT_DEPARTURE',
  'HOTEL_CHECKIN', 'HOTEL_CHECKOUT',
  'HOSPITAL_APPOINTMENT', 'PRE_OP_EXAM', 'SURGERY_DATE', 'POST_OP_CHECKUP',
  'MEDICATION_SCHEDULE', 'FOLLOW_UP_REMOTE',
  'VISA_APPLICATION', 'VISA_APPROVED',
  'INSURANCE_CONFIRMED',
  'CUSTOM'
);

-- case_journeys
CREATE TABLE case_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES cases(id),
  visa JSONB,
  insurance JSONB,
  accommodation JSONB,
  transportation JSONB,
  post_care JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- journey_milestones
CREATE TABLE journey_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  event_type "MilestoneEventType" NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  note TEXT,
  is_visible_to_patient BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_case_journeys_case ON case_journeys(case_id);
CREATE INDEX idx_milestones_case_date ON journey_milestones(case_id, event_date ASC);
CREATE INDEX idx_milestones_patient_visible ON journey_milestones(is_visible_to_patient, event_date ASC) WHERE is_visible_to_patient = true;
