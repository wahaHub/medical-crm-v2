CREATE TABLE chatbot_faq_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  hospital_type VARCHAR(20) NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL,
  CONSTRAINT chatbot_faq_categories_hospital_type_check
    CHECK (hospital_type IN ('REGULAR', 'COSMETIC')),
  CONSTRAINT chatbot_faq_categories_name_hospital_type_key
    UNIQUE (name, hospital_type)
);

CREATE INDEX chatbot_faq_categories_hospital_type_idx
  ON chatbot_faq_categories(hospital_type);
CREATE INDEX chatbot_faq_categories_is_active_idx
  ON chatbot_faq_categories(is_active);

INSERT INTO chatbot_faq_categories (name, hospital_type, sort_order, is_active, updated_at)
SELECT
  category AS name,
  hospital_type,
  MIN(sort_order) AS sort_order,
  BOOL_OR(is_active) AS is_active,
  CURRENT_TIMESTAMP AS updated_at
FROM chatbot_faq_items
GROUP BY category, hospital_type
ON CONFLICT (name, hospital_type) DO NOTHING;
