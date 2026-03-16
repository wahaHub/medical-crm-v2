import { z } from 'zod';

export const serviceCatalogCategorySchema = z.enum([
  'COSMETIC_SURGERY', 'DENTAL', 'DERMATOLOGY', 'ORTHOPEDIC',
  'CARDIAC', 'OPHTHALMIC', 'FERTILITY', 'WEIGHT_LOSS',
  'HAIR_RESTORATION', 'WELLNESS', 'OTHER',
]);

// ---------------------------------------------------------------------------
// Service Catalog Items
// ---------------------------------------------------------------------------

export const createServiceCatalogItemSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameZh: z.string().max(200).optional().nullable(),
  category: serviceCatalogCategorySchema,
  priceMin: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format'),
  priceMax: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format'),
  currency: z.string().max(10).default('USD'),
  estimatedStayDays: z.number().int().positive().optional().nullable(),
  estimatedRecoveryDays: z.number().int().positive().optional().nullable(),
  inclusions: z.unknown().optional(),
  isPublic: z.boolean().default(false),
});

export const updateServiceCatalogItemSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameZh: z.string().max(200).optional().nullable(),
  category: serviceCatalogCategorySchema.optional(),
  priceMin: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format').optional(),
  priceMax: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format').optional(),
  currency: z.string().max(10).optional(),
  estimatedStayDays: z.number().int().positive().optional().nullable(),
  estimatedRecoveryDays: z.number().int().positive().optional().nullable(),
  inclusions: z.unknown().optional(),
  isPublic: z.boolean().optional(),
});

export const serviceCatalogItemListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: serviceCatalogCategorySchema.optional(),
  isPublic: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Quote Templates
// ---------------------------------------------------------------------------

export const createQuoteTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  conditionCategory: z.string().max(100).optional().nullable(),
  lineItemsTemplate: z.unknown(),
  defaultValidDays: z.number().int().positive().default(30),
});

export const updateQuoteTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  conditionCategory: z.string().max(100).optional().nullable(),
  lineItemsTemplate: z.unknown().optional(),
  defaultValidDays: z.number().int().positive().optional(),
});

export const quoteTemplateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  conditionCategory: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateServiceCatalogItemInput = z.infer<typeof createServiceCatalogItemSchema>;
export type UpdateServiceCatalogItemInput = z.infer<typeof updateServiceCatalogItemSchema>;
export type ServiceCatalogItemListQueryInput = z.infer<typeof serviceCatalogItemListQuerySchema>;
export type CreateQuoteTemplateInput = z.infer<typeof createQuoteTemplateSchema>;
export type UpdateQuoteTemplateInput = z.infer<typeof updateQuoteTemplateSchema>;
export type QuoteTemplateListQueryInput = z.infer<typeof quoteTemplateListQuerySchema>;
