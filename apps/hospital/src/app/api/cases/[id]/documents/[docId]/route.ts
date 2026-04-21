import { createParamMutationHandler } from '@/lib/route-handler-helpers';

export const DELETE = createParamMutationHandler(
  'DELETE',
  ({ id, docId }) => `/api/v2/cases/${id}/documents/${docId}`,
);
