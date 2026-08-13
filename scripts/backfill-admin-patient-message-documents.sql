-- Backfill missing case Documents from patient-sent files already stored in
-- ADMIN_PATIENT conversations. Safe to rerun: storage_key is globally unique.
WITH missing_attachments AS (
  SELECT
    c.id AS case_id,
    m.sender_id AS uploaded_by_id,
    attachment.value->>'fileName' AS file_name,
    GREATEST((attachment.value->>'fileSize')::integer, 1) AS file_size,
    attachment.value->>'mimeType' AS mime_type,
    attachment.value->>'storageKey' AS storage_key,
    COALESCE(NULLIF(m.original_language, ''), NULLIF(c.patient_language, ''), 'en') AS language,
    m.created_at
  FROM conversations AS conversation
  JOIN cases AS c ON c.id = conversation.case_id
  JOIN messages AS m ON m.conversation_id = conversation.id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb)) AS attachment(value)
  WHERE conversation.category = 'ADMIN_PATIENT'
    AND m.sender_id = c.patient_id
    AND jsonb_typeof(attachment.value) = 'object'
    AND COALESCE(attachment.value->>'fileName', '') <> ''
    AND COALESCE(attachment.value->>'mimeType', '') <> ''
    AND COALESCE(attachment.value->>'storageKey', '') <> ''
    AND COALESCE(attachment.value->>'fileSize', '') ~ '^[0-9]+$'
    AND attachment.value->>'storageKey' !~* '^(https?:|data:|blob:)'
),
inserted_documents AS (
  INSERT INTO documents (
    id,
    case_id,
    uploaded_by_id,
    file_name,
    file_size,
    mime_type,
    storage_key,
    document_type,
    sensitivity,
    language,
    is_translated,
    status,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    case_id,
    uploaded_by_id,
    file_name,
    file_size,
    mime_type,
    storage_key,
    'OTHER'::"DocumentType",
    'PHI_HIGH'::"Sensitivity",
    language,
    false,
    'PENDING'::"DocumentStatus",
    created_at,
    created_at
  FROM missing_attachments
  ON CONFLICT (storage_key) DO NOTHING
  RETURNING id
)
SELECT COUNT(*) AS documents_created FROM inserted_documents;
