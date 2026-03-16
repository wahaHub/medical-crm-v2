import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(({ id }, p) => `/api/v2/conversations/${id}/messages?${p}`);
