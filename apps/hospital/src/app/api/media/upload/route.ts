import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

function isAllowedUploadTarget(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname.endsWith('.r2.cloudflarestorage.com') || hostname.endsWith('.amazonaws.com');
}

export async function POST(request: NextRequest): Promise<Response> {
  const formData = await request.formData();
  const uploadUrl = formData.get('uploadUrl');
  const file = formData.get('file');

  if (typeof uploadUrl !== 'string' || !(file instanceof File)) {
    return Response.json({ error: 'uploadUrl and file are required' }, { status: 400 });
  }

  let normalizedUrl: URL;
  try {
    normalizedUrl = new URL(uploadUrl);
  } catch {
    return Response.json({ error: 'uploadUrl must be a valid absolute URL' }, { status: 400 });
  }

  if (normalizedUrl.protocol !== 'https:' || !isAllowedUploadTarget(normalizedUrl)) {
    return Response.json({ error: 'uploadUrl target is not allowed' }, { status: 400 });
  }

  const upstream = await fetch(normalizedUrl.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: Buffer.from(await file.arrayBuffer()),
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return Response.json(
      { error: body || 'Failed to upload file', status: upstream.status },
      { status: upstream.status || 502 },
    );
  }

  return new Response(null, { status: 204 });
}
