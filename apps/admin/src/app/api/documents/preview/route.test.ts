import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('admin legacy document preview route', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns 410 without fetching the user supplied URL', async () => {
    const request = new NextRequest('https://admin.example.com/api/documents/preview?url=https://example.com/file.pdf');

    const response = await GET(request);

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: 'Legacy URL preview is disabled. Use case document preview routes.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
