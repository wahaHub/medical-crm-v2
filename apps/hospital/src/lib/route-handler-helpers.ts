import { NextRequest } from 'next/server';
import { apiFetch } from './api-fetch';

export function createQueryHandler(
  buildPath: (searchParams: URLSearchParams) => string,
) {
  return async function GET(request: NextRequest): Promise<Response> {
    const res = await apiFetch(buildPath(request.nextUrl.searchParams));

    if (!res.ok) {
      const body = await res.text();
      return Response.json(
        safeParseJson(body) ?? { error: 'Upstream error', status: res.status },
        { status: res.status },
      );
    }

    const text = await res.text();
    if (!text) return new Response(null, { status: 204 });
    return Response.json(JSON.parse(text));
  };
}

export function createParamQueryHandler(
  buildPath: (
    params: Record<string, string>,
    searchParams: URLSearchParams,
  ) => string,
) {
  return async function GET(
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> },
  ): Promise<Response> {
    const resolvedParams = await params;
    const res = await apiFetch(
      buildPath(resolvedParams, request.nextUrl.searchParams),
    );

    if (!res.ok) {
      const body = await res.text();
      return Response.json(
        safeParseJson(body) ?? { error: 'Upstream error', status: res.status },
        { status: res.status },
      );
    }

    const text = await res.text();
    if (!text) return new Response(null, { status: 204 });
    return Response.json(JSON.parse(text));
  };
}

export function createMutationHandler(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  buildPath: (searchParams: URLSearchParams) => string,
) {
  return async function handler(request: NextRequest): Promise<Response> {
    const body = method === 'DELETE' ? undefined : await request.text();
    const res = await apiFetch(buildPath(request.nextUrl.searchParams), {
      method,
      body,
      headers: {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
      },
    });

    if (!res.ok) {
      const upstreamBody = await res.text();
      return Response.json(
        safeParseJson(upstreamBody) ?? { error: 'Upstream error', status: res.status },
        { status: res.status },
      );
    }

    const text = await res.text();
    if (!text) return new Response(null, { status: res.status });
    return Response.json(JSON.parse(text), { status: res.status });
  };
}

export function createParamMutationHandler(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  buildPath: (
    params: Record<string, string>,
    searchParams: URLSearchParams,
  ) => string,
) {
  return async function handler(
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> },
  ): Promise<Response> {
    const resolvedParams = await params;
    const body = method === 'DELETE' ? undefined : await request.text();
    const res = await apiFetch(buildPath(resolvedParams, request.nextUrl.searchParams), {
      method,
      body,
      headers: {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
      },
    });

    if (!res.ok) {
      const upstreamBody = await res.text();
      return Response.json(
        safeParseJson(upstreamBody) ?? { error: 'Upstream error', status: res.status },
        { status: res.status },
      );
    }

    const text = await res.text();
    if (!text) return new Response(null, { status: res.status });
    return Response.json(JSON.parse(text), { status: res.status });
  };
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
