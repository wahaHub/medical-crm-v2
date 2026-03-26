import { z } from 'zod';

export const chatbotHospitalTypeSchema = z.enum(['COSMETIC', 'REGULAR']);

export const chatbotUploadInitSchema = z.object({
  sessionId: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
}).strict();

export const chatbotChatSchema = z.object({
  sessionId: z.string().min(1).max(255),
  hospitalType: chatbotHospitalTypeSchema,
  message: z.string().min(1).max(2000),
}).strict();

const chatbotConversionBaseSchema = z.object({
  sessionId: z.string().min(1).max(255),
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  country: z.string().min(1).max(100),
  conditionSummary: z.string().min(1).max(2000),
  budget: z.string().min(1).max(200),
});

export const chatbotConvertSchema = chatbotConversionBaseSchema.extend({
  requestedAction: z.enum(['CONSULT_CONVERSION', 'CREATE_CASE']).optional(),
}).strict();

export const chatbotEscalateSchema = chatbotConversionBaseSchema.extend({
  reason: z.string().min(1).max(1000).optional(),
}).strict();

export const chatbotSessionParamSchema = z.object({
  sessionId: z.string().min(1).max(255),
});

export const chatbotHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(100),
});

export type ChatbotUploadInitInput = z.infer<typeof chatbotUploadInitSchema>;
export type ChatbotChatInput = z.infer<typeof chatbotChatSchema>;
export type ChatbotConvertInput = z.infer<typeof chatbotConvertSchema>;
export type ChatbotEscalateInput = z.infer<typeof chatbotEscalateSchema>;
