'use client';

import { useState, useCallback } from 'react';

export interface UploadedAsset {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface UploadInitResult {
  upload: { uploadUrl: string; storageKey: string; expiresIn: number };
  asset: UploadedAsset;
}

export type UploadInitFn = (params: {
  fileName: string;
  fileSize: number;
  mimeType: string;
}) => Promise<UploadInitResult>;

export interface UseMediaUploadOptions {
  maxFiles?: number;
  allowedMimeTypes?: string[];
  maxFileSize?: number;
}

export interface UseMediaUploadReturn {
  upload: (files: File[], initFn: UploadInitFn) => Promise<UploadedAsset[]>;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useMediaUpload(options?: UseMediaUploadOptions): UseMediaUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const upload = useCallback(
    async (files: File[], initFn: UploadInitFn): Promise<UploadedAsset[]> => {
      setError(null);
      const maxFiles = options?.maxFiles ?? 10;

      if (files.length > maxFiles) {
        setError(`Too many files. Maximum is ${maxFiles}.`);
        return [];
      }

      for (const file of files) {
        if (options?.maxFileSize && file.size > options.maxFileSize) {
          const limitMB = Math.round(options.maxFileSize / 1024 / 1024);
          setError(`"${file.name}" exceeds the ${limitMB}MB size limit.`);
          return [];
        }
        if (options?.allowedMimeTypes && !options.allowedMimeTypes.includes(file.type)) {
          setError(`"${file.name}": file type "${file.type}" is not allowed.`);
          return [];
        }
      }

      setIsUploading(true);
      const assets: UploadedAsset[] = [];

      try {
        for (const file of files) {
          const result = await initFn({
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
          });

          const putRes = await uploadToSignedUrl(result.upload.uploadUrl, file);

          if (!putRes.ok) {
            const message = await readUploadError(putRes, file.name);
            throw new Error(message);
          }

          assets.push(result.asset);
        }

        return assets;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        return assets;
      } finally {
        setIsUploading(false);
      }
    },
    [options?.maxFiles, options?.maxFileSize, options?.allowedMimeTypes],
  );

  return { upload, isUploading, error, clearError };
}

async function uploadToSignedUrl(uploadUrl: string, file: File): Promise<Response> {
  try {
    return await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }

    return uploadViaProxy(uploadUrl, file);
  }
}

async function uploadViaProxy(uploadUrl: string, file: File): Promise<Response> {
  const formData = new FormData();
  formData.append('uploadUrl', uploadUrl);
  formData.append('file', file, file.name);

  return fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
  });
}

async function readUploadError(response: Response, fileName: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error ?? body.message ?? `Upload failed for "${fileName}" (status ${response.status})`;
  } catch {
    return `Upload failed for "${fileName}" (status ${response.status})`;
  }
}
