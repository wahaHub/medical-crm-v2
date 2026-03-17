import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(
  ({ id }, searchParams) => `/api/v2/cases/${id}/hospital-contacts?${searchParams}`,
);
