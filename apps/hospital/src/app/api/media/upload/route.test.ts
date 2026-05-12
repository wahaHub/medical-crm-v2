import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

describe('POST /api/media/upload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards an explicit content type to the signed upload target', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const formData = new FormData();
    formData.append('uploadUrl', 'https://bucket.r2.cloudflarestorage.com/path/upload');
    formData.append('contentType', 'video/mp4');
    formData.append('file', new File(['video-bytes'], 'Promotional Video of GHG.mp4', { type: 'application/octet-stream' }));

    const response = await POST(new NextRequest('https://hospital.example.com/api/media/upload', {
      method: 'POST',
      body: formData,
    }));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bucket.r2.cloudflarestorage.com/path/upload',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
      }),
    );
  });
});
