-- Normalize translation task identity to one chunk + one target language.

ALTER TABLE translation_tasks
  ADD COLUMN IF NOT EXISTS chunk_key TEXT NOT NULL DEFAULT 'default';

-- Backfill target_language so every task has a single language identity.
UPDATE translation_tasks
SET target_language = CASE
  WHEN COALESCE(array_length(target_languages, 1), 0) = 1 THEN target_languages[1]
  ELSE 'legacy-batch'
END
WHERE target_language IS NULL OR target_language = '';

ALTER TABLE translation_tasks
  ALTER COLUMN target_language SET NOT NULL;

-- Drop the old entity-only dedupe index and replace it with the chunk-aware identity.
DROP INDEX IF EXISTS translation_tasks_entity_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS translation_tasks_entity_dedup
  ON translation_tasks (source_db, entity_type, entity_id, chunk_key, target_language)
  WHERE status IN ('pending', 'processing');
