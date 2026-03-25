import { z } from 'zod';

export const emailTemplateTypeSchema = z.enum([
  'intro', 'quote', 'marketing', 'followup', 'post_ops', 'custom',
]);

export const emailTemplateStatusSchema = z.enum(['draft', 'active']);

export const emailTemplateAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
  storageKey: z.string().min(1),
  url: z.string().optional(),
});

export const createEmailTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  type: emailTemplateTypeSchema,
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  variables: z.array(z.string()).optional().default([]),
  status: emailTemplateStatusSchema.optional().default('draft'),
  attachments: z.array(emailTemplateAttachmentSchema).optional().default([]),
});

export const updateEmailTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: emailTemplateTypeSchema.optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  status: emailTemplateStatusSchema.optional(),
  attachments: z.array(emailTemplateAttachmentSchema).optional(),
});

export const emailTemplateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: emailTemplateTypeSchema.optional(),
  status: emailTemplateStatusSchema.optional(),
});

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type EmailTemplateListQueryInput = z.infer<typeof emailTemplateListQuerySchema>;
export type EmailTemplateAttachment = z.infer<typeof emailTemplateAttachmentSchema>;
