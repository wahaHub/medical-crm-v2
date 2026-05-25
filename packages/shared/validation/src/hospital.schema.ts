import { z } from 'zod';

export const hospitalStatusSchema = z.enum(['PENDING', 'ACTIVE', 'INACTIVE']);
export const hospitalTypeSchema = z.enum(['COSMETIC', 'REGULAR']);
export const hospitalSiteSchema = z.enum(['cosmetic', 'china', 'global']);

export const createHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  type: hospitalTypeSchema,
  site: hospitalSiteSchema.optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().max(200).optional(),
  description: z.string().optional(),
  specialties: z.array(z.string()).min(1),
});

export const hospitalListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: hospitalStatusSchema.optional(),
  type: hospitalTypeSchema.optional(),
  site: hospitalSiteSchema.optional(),
  search: z.string().optional(),
});

export type CreateHospitalInput = z.infer<typeof createHospitalSchema>;
export type HospitalListQuery = z.infer<typeof hospitalListQuerySchema>;

export const updateHospitalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameEn: z.string().max(200).optional(),
  address: z.string().optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  specialties: z.array(z.string()).optional(),
  site: hospitalSiteSchema.optional(),
});

export const updateHospitalStatusSchema = z.object({
  status: hospitalStatusSchema,
});

export const generateRegistrationTokenSchema = z.object({
  email: z.string().email(),
});

export const registerHospitalUserSchema = z.object({
  token: z.string().min(1),
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
});

export const forgotHospitalPasswordSchema = z.object({
  email: z.string().email(),
});

export const validateHospitalPasswordResetTokenSchema = z.object({
  token: z.string().min(1),
});

export const resetHospitalPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
});

export type UpdateHospitalInput = z.infer<typeof updateHospitalSchema>;
export type UpdateHospitalStatusInput = z.infer<typeof updateHospitalStatusSchema>;
export type GenerateRegistrationTokenInput = z.infer<typeof generateRegistrationTokenSchema>;
export type RegisterHospitalUserInput = z.infer<typeof registerHospitalUserSchema>;
export type ForgotHospitalPasswordInput = z.infer<typeof forgotHospitalPasswordSchema>;
export type ValidateHospitalPasswordResetTokenInput = z.infer<typeof validateHospitalPasswordResetTokenSchema>;
export type ResetHospitalPasswordInput = z.infer<typeof resetHospitalPasswordSchema>;
