import { NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (forwardedFor) {
    headers['x-forwarded-for'] = forwardedFor;
  } else if (realIp) {
    headers['x-real-ip'] = realIp;
  }

  const res = await fetch(`${API_URL}/api/v2/auth/hospital/forgot-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const responseBody = await res.text();
  return new Response(responseBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
