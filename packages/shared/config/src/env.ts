import { z } from 'zod';

export const serverEnvSchema = z.object({
  // CRM Database (Prisma-managed, accessed via Drizzle)
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  // Main Project Supabase (beauty hospitals: surgeons, procedures, etc.)
  MAIN_SUPABASE_URL: z.string().url(),
  MAIN_SUPABASE_SERVICE_KEY: z.string().min(1),
  // China Medical Supabase (regular hospitals)
  CHINA_MEDICAL_SUPABASE_URL: z.string().url(),
  CHINA_MEDICAL_SUPABASE_SERVICE_KEY: z.string().min(1),
  // Auth
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  // AI
  OPENAI_API_KEY: z.string().min(1),
  // Storage (CRM file storage)
  CRM_SUPABASE_URL: z.string().url(),
  CRM_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  // Email
  RESEND_API_KEY: z.string().optional(),
  // CORS origins
  ADMIN_ORIGIN: z.string().url(),
  HOSPITAL_ORIGIN: z.string().url(),
  // Internal API URL (server-side only, used by BFF proxy)
  API_URL: z.string().url(),
  // Keycloak Admin API (hospital user registration)
  KEYCLOAK_BASE_URL: z.string().url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_ADMIN_USERNAME: z.string().min(1),
  KEYCLOAK_ADMIN_PASSWORD: z.string().min(1),
  // Internal worker auth
  INTERNAL_API_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_KEYCLOAK_URL: z.string().url(),
  NEXT_PUBLIC_KEYCLOAK_REALM: z.string().min(1),
  NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
