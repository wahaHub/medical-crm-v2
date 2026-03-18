CREATE TABLE chatbot_faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  question_en TEXT NOT NULL,
  question_zh TEXT NOT NULL,
  answer_en TEXT NOT NULL,
  answer_zh TEXT NOT NULL,
  keywords JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL
);
CREATE INDEX chatbot_faq_items_category_idx ON chatbot_faq_items(category);
CREATE INDEX chatbot_faq_items_is_active_idx ON chatbot_faq_items(is_active);
