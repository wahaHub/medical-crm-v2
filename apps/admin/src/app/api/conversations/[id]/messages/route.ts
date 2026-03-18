import { createParamQueryHandler } from '@/lib/route-handler-helpers';

export const GET = createParamQueryHandler(
  (params, searchParams) => `/api/v2/conversations/${params['id']}/messages?${searchParams}`,
);
