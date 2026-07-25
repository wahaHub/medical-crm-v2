import { createParamMutationHandler, createParamQueryHandler } from '@/lib/route-handler-helpers';

export const GET = createParamQueryHandler(({ id }) => `/api/v2/guides/${id}`);
export const PATCH = createParamMutationHandler('PATCH', ({ id }) => `/api/v2/guides/${id}`);
export const DELETE = createParamMutationHandler('DELETE', ({ id }) => `/api/v2/guides/${id}`);
