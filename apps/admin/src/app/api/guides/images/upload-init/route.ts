import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  const response = await apiFetch('/api/v2/guides/images/upload-init', {
    method: 'POST',
    body: await request.text(),
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
