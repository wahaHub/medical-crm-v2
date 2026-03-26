import { createParamMutationHandler, createParamQueryHandler } from '@/lib/route-handler-helpers';

export const GET = createParamQueryHandler(({ id }, searchParams) => `/api/v2/cases/${id}/progress?${searchParams}`);
export const POST = createParamMutationHandler('POST', ({ id }) => `/api/v2/cases/${id}/progress`);
