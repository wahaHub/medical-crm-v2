import { createParamQueryHandler } from '@/lib/route-handler-helpers';
export const GET = createParamQueryHandler(
  (params) => `/api/v2/chatbot/faqs/${params['id']}`,
);
