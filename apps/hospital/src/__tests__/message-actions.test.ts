import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadFile } from '../actions/message-actions';

describe('message actions', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it('falls back to the media upload proxy when direct message upload throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        upload: {
          uploadUrl: 'https://storage.example.com/upload',
          storageKey: 'messages/conv-1/report.pdf',
        },
        attachment: {
          storageKey: 'messages/conv-1/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          fileSize: 3,
        },
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));

    const file = new File(['abc'], 'report.pdf', { type: 'application/pdf' });

    const result = await uploadFile('conv-1', file);

    expect(global.fetch).toHaveBeenNthCalledWith(3, '/api/media/upload', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }));
    expect(result).toEqual({
      storageKey: 'messages/conv-1/report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileSize: 3,
    });
  });
});
