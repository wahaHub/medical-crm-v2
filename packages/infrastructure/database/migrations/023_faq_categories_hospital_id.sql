-- Add hospital_id to chatbot_faq_categories for per-hospital category management
ALTER TABLE chatbot_faq_categories
  ADD COLUMN IF NOT EXISTS hospital_id UUID;

CREATE INDEX IF NOT EXISTS chatbot_faq_categories_hospital_id_idx
  ON chatbot_faq_categories (hospital_id);

-- Drop old unique constraint (name, hospital_type) and recreate with hospital_id
ALTER TABLE chatbot_faq_categories
  DROP CONSTRAINT IF EXISTS chatbot_faq_categories_name_hospital_type_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'chatbot_faq_categories'::regclass
      AND conname = 'chatbot_faq_categories_name_hospital_type_hospital_id_key'
  ) THEN
    ALTER TABLE chatbot_faq_categories
      ADD CONSTRAINT chatbot_faq_categories_name_hospital_type_hospital_id_key
      UNIQUE (name, hospital_type, hospital_id);
  END IF;
END $$;
