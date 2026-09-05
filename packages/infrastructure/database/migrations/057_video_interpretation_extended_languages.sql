-- Widen interpretation language CHECK constraints from zh/en to the 13 output
-- languages supported by OpenAI gpt-realtime-translate
-- (zh, en, es, pt, fr, de, it, ru, ja, ko, hi, id, vi). Both directions of a
-- job must be valid provider output languages, so the same list applies to
-- source and target columns.

ALTER TABLE video_consultation_interpretation_jobs
  DROP CONSTRAINT IF EXISTS video_consultation_interpretation_jobs_source_language_check,
  DROP CONSTRAINT IF EXISTS video_consultation_interpretation_jobs_target_language_check,
  ADD CONSTRAINT video_consultation_interpretation_jobs_source_language_check
    CHECK (source_language IN ('zh', 'en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'hi', 'id', 'vi')),
  ADD CONSTRAINT video_consultation_interpretation_jobs_target_language_check
    CHECK (target_language IN ('zh', 'en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'hi', 'id', 'vi')
      AND target_language <> source_language);

ALTER TABLE video_consultation_source_tracks
  DROP CONSTRAINT IF EXISTS video_consultation_source_tracks_expected_source_language_check,
  DROP CONSTRAINT IF EXISTS video_consultation_source_tracks_target_language_check,
  ADD CONSTRAINT video_consultation_source_tracks_expected_source_language_check
    CHECK (expected_source_language IN ('zh', 'en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'hi', 'id', 'vi')),
  ADD CONSTRAINT video_consultation_source_tracks_target_language_check
    CHECK (target_language IN ('zh', 'en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'hi', 'id', 'vi')
      AND target_language <> expected_source_language);

ALTER TABLE video_consultation_provider_sessions
  DROP CONSTRAINT IF EXISTS video_consultation_provider_sessions_source_language_check,
  DROP CONSTRAINT IF EXISTS video_consultation_provider_sessions_target_language_check,
  ADD CONSTRAINT video_consultation_provider_sessions_source_language_check
    CHECK (source_language IN ('zh', 'en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'hi', 'id', 'vi')),
  ADD CONSTRAINT video_consultation_provider_sessions_target_language_check
    CHECK (target_language IN ('zh', 'en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'hi', 'id', 'vi')
      AND target_language <> source_language);
