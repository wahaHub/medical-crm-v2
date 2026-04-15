import { NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

const CHATBOT_V3_PATH = '/api/v3/chatbot/chat';

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.text();
  const upstreamResponse = await apiFetch(CHATBOT_V3_PATH, {
    method: 'POST',
    body,
    headers: buildUpstreamHeaders(request),
  });

  return buildProxyResponse(upstreamResponse);
}

function buildUpstreamHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': request.headers.get('content-type') ?? 'application/json',
  };
  copyIdempotencyHeaders(request, headers);

  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.cookie = cookie;
  }

  return headers;
}

function buildProxyResponse(upstreamResponse: Response): Response {
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  appendSetCookieHeaders(headers, upstreamResponse.headers);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}

function appendSetCookieHeaders(target: Headers, source: Headers) {
  const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    for (const value of getSetCookie.call(source)) {
      target.append('set-cookie', value);
    }
    return;
  }

  const setCookie = source.get('set-cookie');
  if (setCookie) {
    target.set('set-cookie', setCookie);
  }
}

function copyIdempotencyHeaders(request: NextRequest, target: Record<string, string>): void {
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) {
    target['Idempotency-Key'] = idempotencyKey;
  }

  const legacyIdempotencyKey = request.headers.get('x-idempotency-key');
  if (legacyIdempotencyKey) {
    target['X-Idempotency-Key'] = legacyIdempotencyKey;
  }
}
