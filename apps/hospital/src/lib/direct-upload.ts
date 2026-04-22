async function uploadViaProxy(uploadUrl: string, file: File): Promise<Response> {
  const formData = new FormData();
  formData.append('uploadUrl', uploadUrl);
  formData.append('file', file, file.name);

  return fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function uploadToSignedUrl(uploadUrl: string, file: File): Promise<Response> {
  try {
    return await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }

    return uploadViaProxy(uploadUrl, file);
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
