import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@medical-crm/ui', '@medical-crm/i18n', '@medical-crm/config'],
};

export default nextConfig;
