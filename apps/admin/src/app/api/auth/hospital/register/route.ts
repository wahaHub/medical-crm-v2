import { NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return Response.json({ error: 'Token required' }, { status: 400 });
  const res = await fetch(`${API_URL}/api/v2/auth/hospital/register?token=${token}`);
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${API_URL}/api/v2/auth/hospital/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const responseBody = await res.text();
  return new Response(responseBody, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
