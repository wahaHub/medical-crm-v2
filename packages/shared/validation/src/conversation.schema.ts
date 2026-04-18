import { z } from 'zod';

export const createConversationSchema = z.object({
  category: z.enum(['HOSPITAL', 'PATIENT', 'ADMIN_HOSPITAL', 'ADMIN_PATIENT', 'HOSPITAL_PATIENT']),
  caseId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  assistantMode: z.literal('AI_ACTIVE').optional(),
});

export const conversationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.enum(['HOSPITAL', 'PATIENT', 'ADMIN_HOSPITAL', 'ADMIN_PATIENT', 'HOSPITAL_PATIENT']).optional(),
  caseId: z.string().uuid().optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
