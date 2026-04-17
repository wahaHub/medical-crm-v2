CREATE TYPE "public"."ConversationAssistantMode" AS ENUM('AI_ACTIVE', 'HUMAN_TAKEOVER');

ALTER TABLE conversations
ADD COLUMN assistant_mode "public"."ConversationAssistantMode" NOT NULL DEFAULT 'AI_ACTIVE';

UPDATE conversations
SET assistant_mode = 'HUMAN_TAKEOVER'
WHERE category = 'ADMIN_PATIENT';
