import { z } from 'zod';

export const createConsultationSchema = z.object({
  caseId: z.string().uuid(),
  hospitalId: z.string().uuid(),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(30),
  consultationLink: z.string().url().optional(),
  aiTranslation: z.boolean().default(false),
  patientLanguage: z.string().max(10).default('en'),
  notes: z.string().optional(),
});

export const updateConsultationSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  consultationLink: z.string().url().optional(),
  aiTranslation: z.boolean().optional(),
  patientLanguage: z.string().max(10).optional(),
  notes: z.string().optional(),
});

export const updateConsultationStatusSchema = z.object({
  action: z.enum(['start', 'complete', 'cancel', 'noShow']),
});

export const consultationListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;
export type UpdateConsultationInput = z.infer<typeof updateConsultationSchema>;
export type UpdateConsultationStatusInput = z.infer<typeof updateConsultationStatusSchema>;
export type ConsultationListQuery = z.infer<typeof consultationListQuerySchema>;
