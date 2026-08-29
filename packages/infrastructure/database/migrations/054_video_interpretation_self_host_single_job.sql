-- The supplied V1 supervisor runs one room for the lifetime of each claim.
-- Normalize any pre-release rows created from an earlier draft and keep API
-- capacity claims aligned with the executable supervisor.
UPDATE video_interpretation_self_hosts
SET max_jobs = 1
WHERE max_jobs <> 1;

ALTER TABLE video_interpretation_self_hosts
  DROP CONSTRAINT IF EXISTS video_interpretation_self_hosts_max_jobs_check;

ALTER TABLE video_interpretation_self_hosts
  ADD CONSTRAINT video_interpretation_self_hosts_max_jobs_check
  CHECK (max_jobs = 1);
