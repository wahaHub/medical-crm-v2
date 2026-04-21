import { createParamMutationHandler } from '@/lib/route-handler-helpers';

export const POST = createParamMutationHandler(
  'POST',
  ({ id, docId }) => `/api/v2/cases/${id}/documents/${docId}/notify-patient`,
);
