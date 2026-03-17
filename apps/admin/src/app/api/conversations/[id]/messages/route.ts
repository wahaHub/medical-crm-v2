import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(
  ({ id }, searchParams) => `/api/v2/conversations/${id}/messages?${searchParams}`,
);
