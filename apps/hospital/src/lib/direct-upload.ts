async function uploadViaProxy(uploadUrl: string, file: File, contentType: string): Promise<Response> {
  const formData = new FormData();
  formData.append('uploadUrl', uploadUrl);
  formData.append('contentType', contentType);
  formData.append('file', file, file.name);

  return fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function uploadToSignedUrl(uploadUrl: string, file: File, contentType?: string): Promise<Response> {
  const resolvedContentType = contentType || file.type || 'application/octet-stream';
  try {
    return await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': resolvedContentType,
      },
      body: file,
    });
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }

    return uploadViaProxy(uploadUrl, file, resolvedContentType);
  }
}

export async function readUploadError(response: Response, fileName: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error ?? body.message ?? `Upload failed for "${fileName}" (status ${response.status})`;
  } catch {
    return `Upload failed for "${fileName}" (status ${response.status})`;
  }
}
