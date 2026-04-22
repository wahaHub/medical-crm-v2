import { createParamMutationHandler } from '@/lib/route-handler-helpers';

export const POST = createParamMutationHandler(
  'POST',
  ({ id }) => `/api/v2/cases/${id}/marketing-email`,
);
