-- Module 6: QuestionCollector
-- Templates, Responses, Customizations

-- Enum
CREATE TYPE "QCCompletionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- Templates
CREATE TABLE question_collector_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  procedure_types TEXT[],
  questions JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Responses
CREATE TABLE question_collector_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  template_id UUID NOT NULL REFERENCES question_collector_templates(id),
  user_id UUID NOT NULL REFERENCES users(id),
  responses JSONB NOT NULL,
  extracted_data JSONB,
  risk_flags TEXT[],
  completion_status "QCCompletionStatus" NOT NULL DEFAULT 'NOT_STARTED',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customizations
CREATE TABLE question_collector_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES question_collector_templates(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  customized_questions JSONB NOT NULL,
  customized_by UUID REFERENCES users(id),
  customized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, hospital_id)
);

-- Indexes
CREATE INDEX idx_qcr_case ON question_collector_responses(case_id, submitted_at DESC);
CREATE INDEX idx_qcr_risk_flags ON question_collector_responses USING gin(risk_flags);
CREATE INDEX idx_qcc_template_hospital ON question_collector_customizations(template_id, hospital_id);
CREATE INDEX idx_qcr_completion_submitted ON question_collector_responses(completion_status, submitted_at DESC);
CREATE INDEX idx_qct_active ON question_collector_templates(is_active, category);
