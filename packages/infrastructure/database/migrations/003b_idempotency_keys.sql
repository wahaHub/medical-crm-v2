-- Idempotency keys (Section 0.5.3)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  result JSONB,               -- NULL while processing, set on completion
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TTL cleanup: add index for periodic purge
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_at);
