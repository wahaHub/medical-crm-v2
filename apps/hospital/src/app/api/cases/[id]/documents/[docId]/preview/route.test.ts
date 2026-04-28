import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: apiFetchMock,
}));

import { GET } from './route';

describe('hospital case document preview route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('proxies the authorized case document preview stream and preserves only preview headers', async () => {
    apiFetchMock.mockResolvedValue(
      new Response('pdf-body', {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="record.pdf"',
          'Cache-Control': 'private, max-age=60',
          'X-Internal-Header': 'secret',
        },
      }),
    );

    const response = await GET(
      new NextRequest('https://hospital.example.com/api/cases/case-1/documents/doc-1/preview'),
      { params: Promise.resolve({ id: 'case-1', docId: 'doc-1' }) },
    );

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v2/cases/case-1/documents/doc-1/preview');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="record.pdf"');
    expect(response.headers.get('cache-control')).toBe('private, max-age=60');
    expect(response.headers.get('x-internal-header')).toBeNull();
    expect(await response.text()).toBe('pdf-body');
  });

  it('returns a JSON error with the upstream status when preview fails', async () => {
    apiFetchMock.mockResolvedValue(new Response('Forbidden', { status: 403 }));

    const response = await GET(
      new NextRequest('https://hospital.example.com/api/cases/case-1/documents/doc-1/preview'),
      { params: Promise.resolve({ id: 'case-1', docId: 'doc-1' }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Failed to preview document',
      status: 403,
    });
  });
});
