import { createMutationHandler, createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler((p) => `/api/v2/conversations?${p}`);
export const POST = createMutationHandler('POST', () => '/api/v2/conversations');
