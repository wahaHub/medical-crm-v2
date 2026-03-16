import { z } from 'zod';

export const quoteStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']);

export const createQuoteSchema = z.object({
  caseId: z.string().uuid(),
  hospitalId: z.string().uuid(),
  totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().max(10).default('USD'),
  validUntil: z.string().datetime(),
  treatmentPlan: z.string().optional(),
  lineItems: z.unknown().optional(),
  notes: z.string().optional(),
});

export const updateQuoteSchema = z.object({
  totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  treatmentPlan: z.string().optional(),
  lineItems: z.unknown().optional(),
  notes: z.string().optional(),
  validUntil: z.string().datetime().optional(),
});

export const quoteListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  caseId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  status: quoteStatusSchema.optional(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type QuoteListQueryInput = z.infer<typeof quoteListQuerySchema>;
