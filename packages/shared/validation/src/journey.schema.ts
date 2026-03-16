import { z } from 'zod';

export const milestoneEventTypeSchema = z.enum([
  'FLIGHT_ARRIVAL', 'FLIGHT_DEPARTURE',
  'HOTEL_CHECKIN', 'HOTEL_CHECKOUT',
  'HOSPITAL_APPOINTMENT', 'PRE_OP_EXAM', 'SURGERY_DATE', 'POST_OP_CHECKUP',
  'MEDICATION_SCHEDULE', 'FOLLOW_UP_REMOTE',
  'VISA_APPLICATION', 'VISA_APPROVED',
  'INSURANCE_CONFIRMED',
  'CUSTOM',
]);

export const updateJourneySchema = z.object({
  visa: z.unknown().optional(),
  insurance: z.unknown().optional(),
  accommodation: z.unknown().optional(),
  transportation: z.unknown().optional(),
  postCare: z.unknown().optional(),
});

export const createMilestoneSchema = z.object({
  eventType: milestoneEventTypeSchema,
  eventDate: z.string().datetime(),
  note: z.string().max(2000).optional(),
  isVisibleToPatient: z.boolean().default(true),
});

export const updateMilestoneSchema = z.object({
  eventType: milestoneEventTypeSchema.optional(),
  eventDate: z.string().datetime().optional(),
  note: z.string().max(2000).nullable().optional(),
  isVisibleToPatient: z.boolean().optional(),
});

export const milestoneListQuerySchema = z.object({
  visibleOnly: z.coerce.boolean().optional(),
});

export type UpdateJourneyInput = z.infer<typeof updateJourneySchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type MilestoneListQueryInput = z.infer<typeof milestoneListQuerySchema>;
