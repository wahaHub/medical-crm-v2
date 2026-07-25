ALTER TABLE guides
  ADD COLUMN IF NOT EXISTS content_document JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_html TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_text TEXT NOT NULL DEFAULT '';

WITH legacy_sections AS (
  SELECT guide.id, section.value, section.ordinality
  FROM guides AS guide
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(guide.content_sections) = 'array' THEN guide.content_sections ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS section(value, ordinality)
), legacy_parts AS (
  SELECT
    legacy_sections.id,
    legacy_sections.ordinality * 2 + part.sort_order AS sort_order,
    part.kind,
    BTRIM(part.value) AS value
  FROM legacy_sections
  CROSS JOIN LATERAL (
    VALUES
      (0, 'heading'::text, legacy_sections.value ->> 'heading'),
      (1, 'body'::text, legacy_sections.value ->> 'body')
  ) AS part(sort_order, kind, value)
  WHERE COALESCE(BTRIM(part.value), '') <> ''
), legacy_content AS (
  SELECT
    id,
    jsonb_agg(
      CASE kind
        WHEN 'heading' THEN jsonb_build_object('type', 'heading', 'attrs', jsonb_build_object('level', 2), 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', value)))
        ELSE jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', value)))
      END
      ORDER BY sort_order
    ) AS document_nodes,
    string_agg(value, E'\n\n' ORDER BY sort_order) AS content_text,
    string_agg(
      CASE kind
        WHEN 'heading' THEN '<h2>' || replace(replace(replace(replace(replace(value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;') || '</h2>'
        ELSE '<p>' || replace(replace(replace(replace(replace(replace(value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'), E'\n', '<br>') || '</p>'
      END,
      '' ORDER BY sort_order
    ) AS content_html
  FROM legacy_parts
  GROUP BY id
)
UPDATE guides AS guide
SET
  content_document = jsonb_build_object('type', 'doc', 'content', legacy_content.document_nodes),
  content_html = legacy_content.content_html,
  content_text = legacy_content.content_text
FROM legacy_content
WHERE guide.id = legacy_content.id
  AND guide.content_document = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb;
