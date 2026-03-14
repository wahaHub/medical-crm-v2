import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**'],
  },
  // Global rule overrides
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // Domain layer: ZERO external imports (only domain/shared allowed)
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['hono', 'hono/*'], message: 'Domain must not depend on Hono.' },
          { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Domain must not depend on Drizzle.' },
          { group: ['@supabase/*'], message: 'Domain must not depend on Supabase.' },
          { group: ['next', 'next/*'], message: 'Domain must not depend on Next.js.' },
          { group: ['react', 'react-dom'], message: 'Domain must not depend on React.' },
          { group: ['@medical-crm/infrastructure', '@medical-crm/infrastructure/*'], message: 'Domain must not depend on infrastructure.' },
          { group: ['@medical-crm/application', '@medical-crm/application/*'], message: 'Domain must not depend on application layer.' },
        ],
      }],
    },
  },
  // Application layer: may not import infrastructure or framework libraries
  {
    files: ['packages/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@medical-crm/infrastructure', '@medical-crm/infrastructure/*'], message: 'Application layer must not import infrastructure directly. Use dependency injection via ports.' },
          { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Application must not depend on Drizzle.' },
          { group: ['@supabase/*'], message: 'Application must not depend on Supabase.' },
          { group: ['hono', 'hono/*'], message: 'Application must not depend on Hono.' },
          { group: ['next', 'next/*'], message: 'Application must not depend on Next.js.' },
          { group: ['react', 'react-dom'], message: 'Application must not depend on React.' },
        ],
      }],
    },
  },
  // Infrastructure layer: may not import application layer or apps
  {
    files: ['packages/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@medical-crm/application', '@medical-crm/application/*'], message: 'Infrastructure must not depend on application layer.' },
          { group: ['@medical-crm/admin', '@medical-crm/hospital'], message: 'Infrastructure must not depend on apps.' },
        ],
      }],
    },
  },
  // Shared layer: imports nothing from other layers
  {
    files: ['packages/shared/**/*.ts', 'packages/shared/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@medical-crm/domain', '@medical-crm/domain/*'], message: 'Shared must not depend on domain.' },
          { group: ['@medical-crm/application', '@medical-crm/application/*'], message: 'Shared must not depend on application.' },
          { group: ['@medical-crm/infrastructure', '@medical-crm/infrastructure/*'], message: 'Shared must not depend on infrastructure.' },
        ],
      }],
    },
  },
);
