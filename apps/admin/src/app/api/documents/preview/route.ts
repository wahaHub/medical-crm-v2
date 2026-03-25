import { NextRequest } from 'next/server';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/["\\\r\n]/g, '_');
}

export async function GET(request: NextRequest): Promise<Response> {
  const sourceUrl = request.nextUrl.searchParams.get('url');
  const fileName = request.nextUrl.searchParams.get('fileName') ?? 'document.pdf';

  if (!sourceUrl) {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }

  let normalizedUrl: URL;
  try {
    normalizedUrl = new URL(sourceUrl);
  } catch {
    return Response.json({ error: 'url must be a valid absolute URL' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(normalizedUrl.protocol)) {
    return Response.json({ error: 'url protocol is not supported' }, { status: 400 });
  }

  const upstream = await fetch(normalizedUrl.toString(), { cache: 'no-store' });
  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text();
    return Response.json(
      { error: body || 'Failed to fetch preview file', status: upstream.status },
      { status: upstream.status || 502 },
    );
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${sanitizeFileName(fileName)}"`);
  headers.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
