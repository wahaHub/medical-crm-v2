import { createParamQueryHandler } from '@/lib/route-handler-helpers';

export const GET = createParamQueryHandler(
  ({ id }) => `/api/v2/packages/${id}`,
);
