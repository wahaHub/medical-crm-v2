CREATE TABLE IF NOT EXISTS hospital_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  hospital_id UUID REFERENCES hospitals(id) ON UPDATE CASCADE ON DELETE SET NULL,
  keycloak_user_id VARCHAR(100) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP(6) NOT NULL,
  used_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_password_reset_tokens_token_hash_key
  ON hospital_password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS hospital_password_reset_tokens_token_hash_idx
  ON hospital_password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS hospital_password_reset_tokens_user_id_idx
  ON hospital_password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS hospital_password_reset_tokens_email_idx
  ON hospital_password_reset_tokens (email);

CREATE INDEX IF NOT EXISTS hospital_password_reset_tokens_expires_at_idx
  ON hospital_password_reset_tokens (expires_at);
