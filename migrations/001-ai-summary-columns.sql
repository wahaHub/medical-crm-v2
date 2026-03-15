-- Phase 2A: Consolidate AI summary columns
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ai_summary_language VARCHAR(10);

-- Migrate existing data (prefer Chinese, fall back to English)
UPDATE cases
SET ai_summary = COALESCE(ai_summary_zh, ai_summary_en),
    ai_summary_language = CASE
      WHEN ai_summary_zh IS NOT NULL THEN 'zh'
      WHEN ai_summary_en IS NOT NULL THEN 'en'
      ELSE NULL
    END
WHERE ai_summary IS NULL
  AND (ai_summary_zh IS NOT NULL OR ai_summary_en IS NOT NULL);

-- Keep old columns for now (drop in future phase after verification)
