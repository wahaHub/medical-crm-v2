-- Extend translation_tasks
ALTER TABLE translation_tasks
  ADD COLUMN IF NOT EXISTS source_db VARCHAR(32) NOT NULL DEFAULT 'crm',
  ADD COLUMN IF NOT EXISTS fields_to_translate JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS target_languages TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS detected_language VARCHAR(10);

ALTER TABLE translation_tasks ALTER COLUMN hospital_type DROP NOT NULL;
ALTER TABLE translation_tasks ALTER COLUMN target_language DROP NOT NULL;

-- Backfill new columns from the legacy one-row-per-target-language model.
UPDATE translation_tasks
SET
  source_db = 'crm',
  target_languages = CASE
    WHEN target_language IS NULL THEN '{}'::text[]
    ELSE ARRAY[target_language]
  END
WHERE target_languages = '{}'::text[];

-- Merge duplicate pending/processing rows created under the old per-language queue model
-- into the new unified one-row-per-entity model.
WITH grouped AS (
  SELECT
    entity_type,
    entity_id,
    CASE
      WHEN COUNT(DISTINCT hospital_type) = 1 THEN MIN(hospital_type)
      ELSE NULL
    END AS merged_hospital_type,
    CASE
      WHEN COUNT(DISTINCT source_language) = 1 THEN MIN(source_language)
      ELSE 'zh'
    END AS merged_source_language,
    CASE
      WHEN BOOL_OR(status = 'processing') THEN 'processing'
      ELSE 'pending'
    END AS merged_status,
    COALESCE(
      ARRAY_AGG(DISTINCT target_language) FILTER (WHERE target_language IS NOT NULL),
      '{}'::text[]
    ) AS merged_target_languages,
    MAX(retry_count) AS merged_retry_count,
    (
      ARRAY_AGG(
        id
        ORDER BY
          CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
          created_at ASC,
          id ASC
      )
    )[1] AS keep_id
  FROM translation_tasks
  WHERE status IN ('pending', 'processing')
  GROUP BY entity_type, entity_id
  HAVING COUNT(*) > 1
), merged_keep_rows AS (
  UPDATE translation_tasks tt
  SET
    hospital_type = grouped.merged_hospital_type,
    source_language = grouped.merged_source_language,
    target_language = CASE
      WHEN COALESCE(array_length(grouped.merged_target_languages, 1), 0) = 1
        THEN grouped.merged_target_languages[1]
      ELSE NULL
    END,
    target_languages = grouped.merged_target_languages,
    source_db = 'crm',
    status = grouped.merged_status,
    retry_count = grouped.merged_retry_count,
    error_message = NULL
  FROM grouped
  WHERE tt.id = grouped.keep_id
  RETURNING tt.id
)
DELETE FROM translation_tasks tt
USING grouped
WHERE tt.entity_type = grouped.entity_type
  AND tt.entity_id = grouped.entity_id
  AND tt.status IN ('pending', 'processing')
  AND tt.id <> grouped.keep_id;

-- Drop old unique constraint, add new partial unique index
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'translation_tasks'::regclass
      AND conname = 'translation_tasks_hospital_type_entity_type_entity_id_sourc_key'
  ) THEN
    ALTER TABLE translation_tasks
      DROP CONSTRAINT IF EXISTS translation_tasks_hospital_type_entity_type_entity_id_sourc_key;
  ELSE
    DROP INDEX IF EXISTS translation_tasks_hospital_type_entity_type_entity_id_sourc_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS translation_tasks_entity_dedup
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
