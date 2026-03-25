-- Hospital portal enhancements data prerequisites:
-- 1) Create email_templates table
-- 2) Add hospital_id scope to chatbot_faq_items

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL,
  deleted_at TIMESTAMP(6)
);

CREATE INDEX IF NOT EXISTS email_templates_hospital_id_idx
  ON email_templates (hospital_id);
CREATE INDEX IF NOT EXISTS email_templates_type_idx
  ON email_templates (type);
CREATE INDEX IF NOT EXISTS email_templates_status_idx
  ON email_templates (status);

ALTER TABLE chatbot_faq_items
  ADD COLUMN IF NOT EXISTS hospital_id UUID;

CREATE INDEX IF NOT EXISTS chatbot_faq_items_hospital_id_idx
  ON chatbot_faq_items (hospital_id);
