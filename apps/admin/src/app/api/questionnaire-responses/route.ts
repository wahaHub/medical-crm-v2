import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(
  (searchParams) => `/api/v2/questionnaire-responses?${searchParams}`,
);
