-- Extend translation_tasks
ALTER TABLE translation_tasks
  ADD COLUMN IF NOT EXISTS source_db VARCHAR(32) NOT NULL DEFAULT 'crm',
  ADD COLUMN IF NOT EXISTS fields_to_translate JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS target_languages TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS detected_language VARCHAR(10);

ALTER TABLE translation_tasks ALTER COLUMN hospital_type DROP NOT NULL;
ALTER TABLE translation_tasks ALTER COLUMN target_language DROP NOT NULL;

-- Drop old unique constraint, add new partial unique index
DROP INDEX IF EXISTS translation_tasks_hospital_type_entity_type_entity_id_sourc_key;
CREATE UNIQUE INDEX translation_tasks_entity_dedup
  ON translation_tasks (source_db, entity_type, entity_id)
  WHERE status IN ('pending', 'processing');

-- Add translations jsonb to CRM tables
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE support_ticket_replies ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE question_collector_templates ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE question_collector_responses ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE chatbot_faq_items ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE chatbot_faq_categories ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
