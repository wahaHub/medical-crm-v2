export function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error('Unable to upload image'));
    });
    request.addEventListener('error', () => reject(new Error('Unable to upload image')));
    request.addEventListener('abort', () => reject(new Error('Image upload was cancelled')));
    request.send(file);
  });
}
