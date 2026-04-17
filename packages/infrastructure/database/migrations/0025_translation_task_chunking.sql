-- Normalize translation task identity to one chunk + one target language.

ALTER TABLE translation_tasks
  ADD COLUMN IF NOT EXISTS chunk_key TEXT NOT NULL DEFAULT 'default';

-- Split any live backlog rows that still carry multiple target languages so the
-- new queue shape is one row per single target language.
WITH legacy_backlog AS (
  SELECT
    id,
    source_db,
    hospital_type,
    entity_type,
    entity_id,
    chunk_key,
    source_language,
    status,
    error_message,
    retry_count,
    created_at,
    started_at,
    completed_at,
    fields_to_translate,
    detected_language,
    unnest(target_languages) AS target_language
  FROM translation_tasks
  WHERE status IN ('pending', 'processing')
    AND COALESCE(array_length(target_languages, 1), 0) > 1
), split_rows AS (
  INSERT INTO translation_tasks (
    id,
    source_db,
    hospital_type,
    entity_type,
    entity_id,
    chunk_key,
    source_language,
    target_language,
    status,
    error_message,
    retry_count,
    created_at,
    started_at,
    completed_at,
    fields_to_translate,
    target_languages,
    detected_language
  )
  SELECT
    gen_random_uuid(),
    source_db,
    hospital_type,
    entity_type,
    entity_id,
    chunk_key,
    source_language,
    target_language,
    status,
    error_message,
    retry_count,
    created_at,
    started_at,
    completed_at,
    fields_to_translate,
    ARRAY[target_language]::text[],
    detected_language
  FROM legacy_backlog
  RETURNING id
)
DELETE FROM translation_tasks tt
USING legacy_backlog lb
WHERE tt.id = lb.id;

-- Backfill target_language so every task has a single language identity.
UPDATE translation_tasks
SET target_language = CASE
  WHEN COALESCE(array_length(target_languages, 1), 0) = 1 THEN target_languages[1]
  ELSE 'legacy-bat'
END
WHERE target_language IS NULL OR target_language = '';

ALTER TABLE translation_tasks
  ALTER COLUMN target_language SET NOT NULL;

-- Collapse duplicate identities across all statuses before creating the new unique index.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY source_db, entity_type, entity_id, chunk_key, target_language
      ORDER BY
        CASE status
          WHEN 'processing' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'completed' THEN 2
          ELSE 3
        END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM translation_tasks
)
DELETE FROM translation_tasks tt
USING ranked
WHERE tt.id = ranked.id
  AND ranked.rn > 1;

-- Drop the old entity-only dedupe index and replace it with the chunk-aware identity.
DROP INDEX IF EXISTS translation_tasks_entity_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS translation_tasks_entity_dedup
  ON translation_tasks (source_db, entity_type, entity_id, chunk_key, target_language)
