import { z } from 'zod';

export const ticketTypeSchema = z.enum([
  'ACCOUNT_ISSUES', 'PAYMENT_PROBLEMS', 'HOSPITAL_COMMUNICATION',
  'DOCUMENT_HELP', 'VISA_TRAVEL', 'GENERAL_QUESTIONS', 'FEEDBACK',
]);

export const ticketPrioritySchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const ticketStatusSchema = z.enum(['OPEN', 'ASSIGNED', 'PENDING_INFO', 'RESOLVED', 'CLOSED']);

export const createTicketSchema = z.object({
  caseId: z.string().uuid().optional(),
  type: ticketTypeSchema,
  priority: ticketPrioritySchema.default('MEDIUM'),
  subject: z.string().max(500).optional(),
  description: z.string().min(1),
  sourcePage: z.string().max(200).optional(),
});

export const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: ticketStatusSchema.optional(),
  type: ticketTypeSchema.optional(),
  priority: ticketPrioritySchema.optional(),
});

export const assignTicketSchema = z.object({
  assignedTo: z.string().uuid(),
});

export const replyToTicketSchema = z.object({
  content: z.string().min(1),
  isInternalNote: z.boolean().default(false),
  attachments: z.unknown().optional(),
});

export const updateTicketStatusSchema = z.object({
  status: ticketStatusSchema,
});

export const closeTicketSchema = z.object({
  resolutionNote: z.string().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type TicketListQueryInput = z.infer<typeof ticketListQuerySchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type ReplyToTicketInput = z.infer<typeof replyToTicketSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
export type CloseTicketInput = z.infer<typeof closeTicketSchema>;
