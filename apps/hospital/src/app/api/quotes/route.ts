import { createQueryHandler } from '@/lib/route-handler-helpers';

export const GET = createQueryHandler((params) => `/api/v2/quotes?${params}`);
