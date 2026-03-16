import { z } from 'zod';

export const orderTypeSchema = z.enum(['PACKAGE', 'CONSULTATION', 'CUSTOM']);
export const orderStatusSchema = z.enum(['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED']);

export const createOrderSchema = z.object({
  caseId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  type: orderTypeSchema,
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format'),
  currency: z.string().max(10).default('USD'),
  metadata: z.unknown().optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: orderStatusSchema.optional(),
  type: orderTypeSchema.optional(),
  caseId: z.string().uuid().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

export const requestRefundSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format'),
  reason: z.string().min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderListQueryInput = z.infer<typeof orderListQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
