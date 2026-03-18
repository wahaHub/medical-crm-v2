import { z } from 'zod';

export const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  preferredLanguage: z.enum(['en', 'zh']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
