import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaUpload } from '../use-media-upload';

describe('useMediaUpload', () => {
  const mockInitFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useMediaUpload());
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.upload).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  it('uploads a single file successfully', async () => {
    const asset = {
      storageKey: 'crm/dev/test/ast_123/photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
    };
    mockInitFn.mockResolvedValue({
      upload: { uploadUrl: 'https://presigned.example.com/put', storageKey: asset.storageKey, expiresIn: 600 },
      asset,
    });

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload());

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file], mockInitFn);
    });

    expect(mockInitFn).toHaveBeenCalledWith({
      fileName: 'photo.jpg',
      fileSize: 4,
      mimeType: 'image/jpeg',
    });
    expect(global.fetch).toHaveBeenCalledWith('https://presigned.example.com/put', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: file,
    });
    expect(assets!).toEqual([asset]);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('uploads multiple files sequentially', async () => {
    const asset1 = { storageKey: 'key1', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 100 };
    const asset2 = { storageKey: 'key2', fileName: 'b.png', mimeType: 'image/png', fileSize: 200 };
    mockInitFn
      .mockResolvedValueOnce({ upload: { uploadUrl: 'https://url1', storageKey: 'key1', expiresIn: 600 }, asset: asset1 })
      .mockResolvedValueOnce({ upload: { uploadUrl: 'https://url2', storageKey: 'key2', expiresIn: 600 }, asset: asset2 });

    const file1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['bb'], 'b.png', { type: 'image/png' });
    const { result } = renderHook(() => useMediaUpload());

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file1, file2], mockInitFn);
    });

    expect(assets!).toEqual([asset1, asset2]);
    expect(mockInitFn).toHaveBeenCalledTimes(2);
  });

  it('rejects files exceeding maxFileSize', async () => {
    const file = new File(['x'.repeat(100)], 'big.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload({ maxFileSize: 50 }));

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file], mockInitFn);
    });

    expect(assets!).toEqual([]);
    expect(result.current.error).toMatch(/exceeds.*limit/i);
    expect(mockInitFn).not.toHaveBeenCalled();
  });

  it('rejects files with disallowed MIME types', async () => {
    const file = new File(['data'], 'script.exe', { type: 'application/x-msdownload' });
    const { result } = renderHook(() =>
      useMediaUpload({ allowedMimeTypes: ['image/jpeg', 'image/png'] }),
    );

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file], mockInitFn);
    });

    expect(assets!).toEqual([]);
    expect(result.current.error).toMatch(/file type.*not allowed/i);
    expect(mockInitFn).not.toHaveBeenCalled();
  });

  it('sets error when PUT to presigned URL fails', async () => {
    mockInitFn.mockResolvedValue({
      upload: { uploadUrl: 'https://fail.example.com', storageKey: 'k', expiresIn: 600 },
      asset: { storageKey: 'k', fileName: 'f.jpg', mimeType: 'image/jpeg', fileSize: 1 },
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 });

    const file = new File(['d'], 'f.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload());

    await act(async () => {
      await result.current.upload([file], mockInitFn);
    });

    expect(result.current.error).toMatch(/upload failed/i);
  });

  it('clearError resets error state', async () => {
    mockInitFn.mockRejectedValue(new Error('boom'));
    const file = new File(['d'], 'f.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload());

    await act(async () => {
      await result.current.upload([file], mockInitFn);
    });
    expect(result.current.error).toBeTruthy();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });
});
