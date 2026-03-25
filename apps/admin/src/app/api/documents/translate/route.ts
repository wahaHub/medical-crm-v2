import { createMutationHandler } from '@/lib/route-handler-helpers';

export const POST = createMutationHandler('POST', () => '/api/v2/documents/translate');
