import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(() => `/api/v2/cases/stats`);
