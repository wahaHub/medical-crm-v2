import { z } from 'zod';

export const createChatbotFaqSchema = z.object({
  category: z.string().min(1).max(100),
  questionEn: z.string().min(1).max(1000),
  questionZh: z.string().min(1).max(1000),
  answerEn: z.string().min(1),
  answerZh: z.string().min(1),
  keywords: z.array(z.string().min(1)).default([]),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateChatbotFaqSchema = createChatbotFaqSchema.partial();

export const chatbotFaqListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type CreateChatbotFaqInput = z.infer<typeof createChatbotFaqSchema>;
export type UpdateChatbotFaqInput = z.infer<typeof updateChatbotFaqSchema>;
export type ChatbotFaqListQueryInput = z.infer<typeof chatbotFaqListQuerySchema>;
