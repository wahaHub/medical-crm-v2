import { z } from 'zod';

export const faqHospitalTypeSchema = z.enum(['REGULAR', 'COSMETIC']);

const faqAttachmentSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().positive(),
});

export const createChatbotFaqSchema = z.object({
  category: z.string().min(1).max(100),
  question: z.string().min(1).max(1000),
  answer: z.string().min(1),
  hospitalType: faqHospitalTypeSchema,
  keywords: z.array(z.string().min(1)).default([]),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  attachments: z.array(faqAttachmentSchema).default([]),
});

export const updateChatbotFaqSchema = createChatbotFaqSchema.partial();

export const chatbotFaqListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.string().optional(),
  hospitalType: faqHospitalTypeSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export const createFaqCategorySchema = z.object({
  name: z.string().min(1).max(100),
  hospitalType: faqHospitalTypeSchema,
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const faqCategoryListQuerySchema = z.object({
  hospitalType: faqHospitalTypeSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateChatbotFaqInput = z.infer<typeof createChatbotFaqSchema>;
export type UpdateChatbotFaqInput = z.infer<typeof updateChatbotFaqSchema>;
export type ChatbotFaqListQueryInput = z.infer<typeof chatbotFaqListQuerySchema>;
export type CreateFaqCategoryInput = z.infer<typeof createFaqCategorySchema>;
export type FaqCategoryListQueryInput = z.infer<typeof faqCategoryListQuerySchema>;
