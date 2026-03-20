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

          const putRes = await fetch(result.upload.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });

          if (!putRes.ok) {
            throw new Error(`Upload failed for "${file.name}" (status ${putRes.status})`);
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
