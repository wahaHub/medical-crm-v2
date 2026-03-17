import { z } from 'zod';
import { sanitizeRichText } from '@medical-crm/utils';

export const sendMessageSchema = z.object({
  content: z.string().max(10000).transform(sanitizeRichText),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'SYSTEM']).default('TEXT'),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileSize: z.number(),
    mimeType: z.string(),
    storageKey: z.string(),
  })).optional(),
}).superRefine((value, ctx) => {
  const hasContent = value.content.trim().length > 0;
  const hasAttachments = (value.attachments?.length ?? 0) > 0;

  if (!hasContent && !hasAttachments) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: 'Message content or attachments are required',
    });
  }
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(10000).transform(sanitizeRichText),
});

export const messageListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
