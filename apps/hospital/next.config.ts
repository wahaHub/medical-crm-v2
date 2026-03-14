import type { NextConfig } from 'next';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ['@medical-crm/ui', '@medical-crm/i18n', '@medical-crm/config'],
  // Point to the monorepo root so Next.js traces dependencies correctly
  outputFileTracingRoot: resolve(__dirname, '../../'),
};

export default nextConfig;
