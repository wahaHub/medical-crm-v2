import { z } from 'zod';

export const packageTypeSchema = z.enum(['TREATMENT', 'CONSULTATION', 'BUNDLE', 'ADD_ON']);
export const packageStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);

export const createPackageSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameZh: z.string().max(200).optional(),
  type: packageTypeSchema,
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format'),
  currency: z.string().max(10).default('USD'),
  descriptionEn: z.string().optional(),
  descriptionZh: z.string().optional(),
  inclusions: z.unknown().optional(),
  coverImageUrl: z.string().max(500).optional(),
  sortWeight: z.number().int().default(0),
  publishAt: z.string().datetime().optional(),
  takedownAt: z.string().datetime().optional(),
  config: z.unknown().optional(),
});

export const updatePackageSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameZh: z.string().max(200).optional().nullable(),
  type: packageTypeSchema.optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format').optional(),
  currency: z.string().max(10).optional(),
  descriptionEn: z.string().optional().nullable(),
  descriptionZh: z.string().optional().nullable(),
  inclusions: z.unknown().optional(),
  coverImageUrl: z.string().max(500).optional().nullable(),
  sortWeight: z.number().int().optional(),
  publishAt: z.string().datetime().optional().nullable(),
  takedownAt: z.string().datetime().optional().nullable(),
  config: z.unknown().optional(),
});

export const packageListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: packageStatusSchema.optional(),
  type: packageTypeSchema.optional(),
});

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
export type PackageListQueryInput = z.infer<typeof packageListQuerySchema>;
