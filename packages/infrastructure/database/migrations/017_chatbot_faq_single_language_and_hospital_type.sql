-- Refactor chatbot FAQ data model:
-- 1) Move from multilingual question/answer fields to single-language fields.
-- 2) Add hospital_type scope (REGULAR / COSMETIC).

ALTER TABLE chatbot_faq_items
  ADD COLUMN IF NOT EXISTS hospital_type VARCHAR(20) NOT NULL DEFAULT 'REGULAR';

ALTER TABLE chatbot_faq_items
  ADD COLUMN IF NOT EXISTS question TEXT;

ALTER TABLE chatbot_faq_items
  ADD COLUMN IF NOT EXISTS answer TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'chatbot_faq_items'
      AND column_name IN ('question_en', 'question_zh', 'answer_en', 'answer_zh')
  ) THEN
    UPDATE chatbot_faq_items
    SET
      question = COALESCE(question, NULLIF(question_en, ''), NULLIF(question_zh, ''), ''),
      answer = COALESCE(answer, NULLIF(answer_en, ''), NULLIF(answer_zh, ''), '');
  END IF;
END $$;

ALTER TABLE chatbot_faq_items
  ALTER COLUMN question SET NOT NULL;

ALTER TABLE chatbot_faq_items
  ALTER COLUMN answer SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chatbot_faq_items_hospital_type_check'
  ) THEN
    ALTER TABLE chatbot_faq_items
      ADD CONSTRAINT chatbot_faq_items_hospital_type_check
      CHECK (hospital_type IN ('REGULAR', 'COSMETIC'));
  END IF;
END $$;

ALTER TABLE chatbot_faq_items
  DROP COLUMN IF EXISTS question_en,
  DROP COLUMN IF EXISTS question_zh,
  DROP COLUMN IF EXISTS answer_en,
  DROP COLUMN IF EXISTS answer_zh;

CREATE INDEX IF NOT EXISTS chatbot_faq_items_hospital_type_idx
  ON chatbot_faq_items(hospital_type);
