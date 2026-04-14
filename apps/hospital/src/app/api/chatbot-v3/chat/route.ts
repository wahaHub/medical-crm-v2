import { createMutationHandler } from '@/lib/route-handler-helpers';

export const POST = createMutationHandler('POST', () => '/api/v3/chatbot/chat');
