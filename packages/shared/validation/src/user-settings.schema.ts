import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
  newCase: z.boolean().optional(),
  newMessage: z.boolean().optional(),
  quoteStatusChange: z.boolean().optional(),
  consultationReminder: z.boolean().optional(),
});

export const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  preferredLanguage: z.enum(['en', 'zh']).optional(),
  notifications: notificationPreferencesSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
