export class ServerSideUploadService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async uploadBytes(input: {
    uploadUrl: string;
    bytes: Uint8Array;
    mimeType: string;
    label: string;
  }): Promise<void> {
    const response = await this.fetchImpl(input.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType },
      body: input.bytes,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${input.label} upload failed: ${response.status}${detail ? ` ${detail}` : ''}`);
    }
  }
}
