import { createQueryHandler } from '@/lib/route-handler-helpers';
import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export const GET = createQueryHandler(
  (searchParams) => `/api/v2/conversations?${searchParams}`,
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await apiFetch('/api/v2/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const responseBody = await res.text();
  return new Response(responseBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
