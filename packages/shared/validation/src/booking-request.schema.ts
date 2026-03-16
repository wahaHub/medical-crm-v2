import { z } from 'zod';

export const bookingConditionTypeSchema = z.enum(['COSMETIC', 'MEDICAL', 'DENTAL', 'WELLNESS', 'OTHER']);

export const createBookingRequestSchema = z.object({
  conditionType: bookingConditionTypeSchema,
  conditionCategory: z.string().min(1).max(100),
  conditionDescription: z.string().max(2000).optional(),
  destinationPreference: z.unknown().optional(),
  preferredLanguage: z.string().max(10).default('en'),
});

export const saveHospitalSelectionsSchema = z.object({
  hospitalIds: z.array(z.string().uuid()).min(1).max(10),
});

export const completeSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  fullName: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
});

export type CreateBookingRequestInput = z.infer<typeof createBookingRequestSchema>;
export type SaveHospitalSelectionsInput = z.infer<typeof saveHospitalSelectionsSchema>;
export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;
