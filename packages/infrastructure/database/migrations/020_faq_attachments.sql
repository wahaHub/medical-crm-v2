ALTER TABLE chatbot_faq_items ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
