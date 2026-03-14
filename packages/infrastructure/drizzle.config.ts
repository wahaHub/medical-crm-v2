import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './database/schema',
  schema: './database/schema/*.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
