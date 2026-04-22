import { readUploadError, uploadToSignedUrl } from '@/lib/direct-upload';

interface CaseDocumentUploadAsset {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

interface InitCaseDocumentUploadResponse {
  upload: {
    uploadUrl: string;
    storageKey: string;
  };
  asset?: CaseDocumentUploadAsset;
  documentId?: string;
}

async function localApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    let error = 'Request failed';
    try {
      const parsed = JSON.parse(text) as { error?: string };
      error = parsed.error ?? text ?? error;
    } catch {
      error = text || error;
    }
    throw new Error(error);
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function uploadCaseDocument(
  caseId: string,
  file: File,
  documentType: 'DIAGNOSIS' | 'INVITATION' | 'OTHER',
): Promise<CaseDocumentUploadAsset & { documentId?: string }> {
  const init = await localApiRequest<InitCaseDocumentUploadResponse>(`/api/cases/${caseId}/documents`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      documentType,
      sensitivity: 'PHI_HIGH',
      language: 'en',
    }),
  });

  const uploadRes = await uploadToSignedUrl(init.upload.uploadUrl, file);

  if (!uploadRes.ok) {
    if (init.documentId) {
      try {
        await deleteCaseDocument(caseId, init.documentId);
      } catch (error) {
        console.warn('Failed to clean up case document after upload failure:', error);
      }
    }
    throw new Error(await readUploadError(uploadRes, file.name));
  }

  if (!init.asset) {
    throw new Error('Upload initialized successfully but no asset payload was returned');
  }

  if (documentType === 'INVITATION' && init.documentId) {
    try {
      await localApiRequest<void>(`/api/cases/${caseId}/documents/${init.documentId}/notify-patient`, {
        method: 'POST',
      });
    } catch (error) {
      console.warn('Failed to notify patient about uploaded invitation letter:', error);
    }
  }

  return {
    ...init.asset,
    documentId: init.documentId,
  };
}

export async function deleteCaseDocument(caseId: string, documentId: string): Promise<void> {
  await localApiRequest<void>(`/api/cases/${caseId}/documents/${documentId}`, {
    method: 'DELETE',
  });
}
