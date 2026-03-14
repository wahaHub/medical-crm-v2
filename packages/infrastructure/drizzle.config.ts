import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './database/schema',
  schema: [
    './database/schema/schema.ts',
    './database/schema/relations.ts',
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
