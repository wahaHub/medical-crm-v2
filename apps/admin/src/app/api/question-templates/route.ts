import { createQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createQueryHandler(
  (searchParams) => `/api/v2/question-templates?${searchParams}`,
);
