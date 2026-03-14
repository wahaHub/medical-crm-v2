import { z } from 'zod';

export const hospitalStatusSchema = z.enum(['PENDING', 'ACTIVE', 'INACTIVE']);
export const hospitalTypeSchema = z.enum(['COSMETIC', 'REGULAR']);

export const createHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  type: hospitalTypeSchema,
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
});

export const hospitalListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: hospitalStatusSchema.optional(),
  type: hospitalTypeSchema.optional(),
  search: z.string().optional(),
});

export type CreateHospitalInput = z.infer<typeof createHospitalSchema>;
export type HospitalListQuery = z.infer<typeof hospitalListQuerySchema>;
