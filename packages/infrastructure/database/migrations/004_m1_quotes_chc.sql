-- ============================================================================
-- Module 1: Quotes + CaseHospitalContacts
-- ============================================================================

-- Enums
CREATE TYPE "CHCSubStatus" AS ENUM ('DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REMOVED');
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- case_hospital_contacts
CREATE TABLE case_hospital_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  sub_status "CHCSubStatus" NOT NULL DEFAULT 'DISTRIBUTED',
  selected_by_patient_at TIMESTAMPTZ,
  distributed_at TIMESTAMPTZ DEFAULT now(),
  first_reply_at TIMESTAMPTZ,
  quote_id UUID,
  patient_viewed_quote_at TIMESTAMPTZ,
  patient_accepted_at TIMESTAMPTZ,
  patient_rejected_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removed_reason TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, hospital_id)
);

-- quotes
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  quote_number VARCHAR(50) NOT NULL UNIQUE,
  version INT NOT NULL DEFAULT 1,
  status "QuoteStatus" NOT NULL DEFAULT 'PENDING',
  is_draft BOOLEAN NOT NULL DEFAULT true,
  total_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  valid_until TIMESTAMPTZ NOT NULL,
  treatment_plan TEXT,
  line_items JSONB,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deferred FK: CHC → quotes
ALTER TABLE case_hospital_contacts
  ADD CONSTRAINT chc_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id);

-- Indexes
CREATE INDEX idx_chc_hospital_sub_distributed ON case_hospital_contacts(hospital_id, sub_status, distributed_at DESC);
CREATE INDEX idx_chc_case_sub ON case_hospital_contacts(case_id, sub_status);
CREATE INDEX idx_chc_sub_distributed ON case_hospital_contacts(sub_status, distributed_at);
CREATE INDEX idx_chc_quote_id ON case_hospital_contacts(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_quotes_case_status_created ON quotes(case_id, status, created_at DESC);
CREATE INDEX idx_quotes_hospital_status_created ON quotes(hospital_id, status, created_at DESC);
CREATE INDEX idx_quotes_valid_until_active ON quotes(valid_until) WHERE status = 'PENDING';
