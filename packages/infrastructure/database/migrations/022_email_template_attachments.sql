-- Add attachments column to email_templates for file/image uploads
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
