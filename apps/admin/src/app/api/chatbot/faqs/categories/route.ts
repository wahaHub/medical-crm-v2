import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/api/v2/chatbot/faqs/categories?${query}` : '/api/v2/chatbot/faqs/categories';
  const res = await apiFetch(path);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await apiFetch('/api/v2/chatbot/faqs/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const responseBody = await res.text();
  return new Response(responseBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
