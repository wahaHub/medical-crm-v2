import { createMutationHandler, createQueryHandler } from '@/lib/route-handler-helpers';

export const GET = createQueryHandler((searchParams) => `/api/v2/guides?${searchParams}`);
export const POST = createMutationHandler('POST', () => '/api/v2/guides');
