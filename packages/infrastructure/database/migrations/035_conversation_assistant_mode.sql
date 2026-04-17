CREATE TYPE "public"."ConversationAssistantMode" AS ENUM('AI_ACTIVE', 'HUMAN_TAKEOVER');

ALTER TABLE conversations
ADD COLUMN assistant_mode "public"."ConversationAssistantMode" NOT NULL DEFAULT 'AI_ACTIVE';

UPDATE conversations
SET assistant_mode = 'HUMAN_TAKEOVER'
WHERE category = 'ADMIN_PATIENT';

WITH ranked_admin_patient_conversations AS (
  SELECT
    id,
    case_id,
    assistant_mode,
    title,
    created_at,
    updated_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY case_id
      ORDER BY created_at ASC, id ASC
    ) AS canonical_id,
    ROW_NUMBER() OVER (
      PARTITION BY case_id
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM conversations
  WHERE category = 'ADMIN_PATIENT'
    AND case_id IS NOT NULL
),
duplicate_admin_patient_conversations AS (
  SELECT *
  FROM ranked_admin_patient_conversations
  WHERE row_num > 1
)
UPDATE messages AS message_rows
SET conversation_id = duplicate_rows.canonical_id
FROM duplicate_admin_patient_conversations AS duplicate_rows
WHERE message_rows.conversation_id = duplicate_rows.id;

WITH ranked_admin_patient_conversations AS (
  SELECT
    id,
    case_id,
    assistant_mode,
    title,
    created_at,
    updated_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY case_id
      ORDER BY created_at ASC, id ASC
    ) AS canonical_id
  FROM conversations
  WHERE category = 'ADMIN_PATIENT'
    AND case_id IS NOT NULL
),
merged_admin_patient_conversations AS (
  SELECT
    canonical_id,
    BOOL_OR(assistant_mode = 'HUMAN_TAKEOVER') AS should_take_over,
    MAX(title) FILTER (WHERE title IS NOT NULL) AS merged_title,
    MAX(updated_at) AS latest_updated_at
  FROM ranked_admin_patient_conversations
  GROUP BY canonical_id
  HAVING COUNT(*) > 1
)
UPDATE conversations AS canonical
SET
  assistant_mode = CASE
    WHEN merged.should_take_over THEN 'HUMAN_TAKEOVER'::"public"."ConversationAssistantMode"
    ELSE canonical.assistant_mode
  END,
  title = COALESCE(canonical.title, merged.merged_title),
  updated_at = GREATEST(canonical.updated_at, merged.latest_updated_at)
FROM merged_admin_patient_conversations AS merged
WHERE canonical.id = merged.canonical_id;

WITH ranked_admin_patient_conversations AS (
  SELECT
    id,
    case_id,
    ROW_NUMBER() OVER (
      PARTITION BY case_id
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM conversations
  WHERE category = 'ADMIN_PATIENT'
    AND case_id IS NOT NULL
)
DELETE FROM conversations
WHERE id IN (
  SELECT id
  FROM ranked_admin_patient_conversations
  WHERE row_num > 1
);

WITH latest_messages AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    id,
    created_at,
    content,
    sender_id
  FROM messages
  ORDER BY conversation_id, created_at DESC, id DESC
)
UPDATE conversations AS conversation_rows
SET
  last_message_id = latest_messages.id,
  last_message_at = latest_messages.created_at,
  last_message_preview = latest_messages.content,
  last_sender_id = latest_messages.sender_id
FROM latest_messages
WHERE conversation_rows.id = latest_messages.conversation_id
  AND conversation_rows.category = 'ADMIN_PATIENT';

CREATE UNIQUE INDEX IF NOT EXISTS conversations_admin_patient_case_unique_idx
  ON conversations (case_id)
  WHERE category = 'ADMIN_PATIENT' AND case_id IS NOT NULL;
