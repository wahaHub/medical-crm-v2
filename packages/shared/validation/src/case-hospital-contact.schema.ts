import { z } from 'zod';

export const chcSubStatusSchema = z.enum([
  'DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REMOVED',
]);

export const chcListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  caseId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  subStatus: chcSubStatusSchema.optional(),
});

export type CHCListQueryInput = z.infer<typeof chcListQuerySchema>;
