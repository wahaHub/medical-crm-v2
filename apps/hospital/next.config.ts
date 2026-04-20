import type { NextConfig } from 'next';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../../.env') });

const nextConfig: NextConfig = {
  transpilePackages: ['@medical-crm/ui', '@medical-crm/i18n', '@medical-crm/config'],
  // Point to the monorepo root so Next.js traces dependencies correctly
  outputFileTracingRoot: resolve(__dirname, '../../'),
  // Keep local dev output separate so `next build` does not corrupt a live `next dev` session.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  devIndicators: false,
};

export default nextConfig;
