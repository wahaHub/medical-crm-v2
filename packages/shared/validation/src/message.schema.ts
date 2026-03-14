import { z } from 'zod';
import { sanitizeRichText } from '@medical-crm/utils';

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000).transform(sanitizeRichText),
  conversationId: z.string().uuid(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
