CREATE TEMP TABLE admin_patient_conversation_dedupe AS
WITH ranked AS (
  SELECT
    id,
    case_id,
    FIRST_VALUE(id) OVER (
      PARTITION BY case_id
      ORDER BY last_message_at DESC NULLS LAST, updated_at DESC, created_at DESC, id DESC
    ) AS canonical_id
  FROM conversations
  WHERE category = 'ADMIN_PATIENT' AND case_id IS NOT NULL
)
SELECT
  case_id,
  canonical_id,
  id AS duplicate_id
FROM ranked
WHERE id <> canonical_id;

UPDATE messages AS m
SET conversation_id = d.canonical_id
FROM admin_patient_conversation_dedupe AS d
WHERE m.conversation_id = d.duplicate_id;

CREATE TEMP TABLE admin_patient_conversation_metadata AS
SELECT
  g.canonical_id,
  (
    SELECT c.title
    FROM conversations AS c
    WHERE c.case_id = g.case_id
      AND c.category = 'ADMIN_PATIENT'
      AND c.title IS NOT NULL
    ORDER BY c.updated_at DESC, c.last_message_at DESC NULLS LAST, c.created_at DESC, c.id DESC
    LIMIT 1
  ) AS merged_title,
  (
    SELECT c.hospital_id
    FROM conversations AS c
    WHERE c.case_id = g.case_id
      AND c.category = 'ADMIN_PATIENT'
      AND c.hospital_id IS NOT NULL
    ORDER BY c.updated_at DESC, c.last_message_at DESC NULLS LAST, c.created_at DESC, c.id DESC
    LIMIT 1
  ) AS merged_hospital_id
FROM (
  SELECT DISTINCT canonical_id, case_id
  FROM admin_patient_conversation_dedupe
) AS g;

UPDATE conversations AS c
SET
  title = COALESCE(meta.merged_title, c.title),
  hospital_id = COALESCE(meta.merged_hospital_id, c.hospital_id),
  last_message_id = latest.id,
  last_message_at = latest.created_at,
  last_message_preview = LEFT(latest.content, 100),
  last_sender_id = latest.sender_id,
  updated_at = GREATEST(c.updated_at, latest.created_at)
FROM (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.id,
    m.created_at,
    m.content,
    m.sender_id
  FROM messages AS m
  JOIN conversations AS c2 ON c2.id = m.conversation_id
  WHERE c2.category = 'ADMIN_PATIENT' AND c2.case_id IS NOT NULL
  ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
) AS latest
LEFT JOIN admin_patient_conversation_metadata AS meta
  ON meta.canonical_id = latest.conversation_id
WHERE c.id = latest.conversation_id
  AND c.id IN (
    SELECT DISTINCT canonical_id
    FROM admin_patient_conversation_dedupe
  );

DELETE FROM conversations AS c
USING admin_patient_conversation_dedupe AS d
WHERE c.id = d.duplicate_id;

DROP TABLE admin_patient_conversation_metadata;
DROP TABLE admin_patient_conversation_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_admin_patient_case_unique
ON conversations (case_id)
WHERE category = 'ADMIN_PATIENT' AND case_id IS NOT NULL;
