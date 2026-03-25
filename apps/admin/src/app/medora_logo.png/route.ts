import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CANDIDATES = [
  resolve(process.cwd(), 'public/medora_logo.png'),
  resolve(process.cwd(), '../hospital/public/medora_logo.png'),
  resolve(process.cwd(), 'apps/hospital/public/medora_logo.png'),
  resolve(process.cwd(), '../../apps/hospital/public/medora_logo.png'),
];

export async function GET() {
  for (const filePath of CANDIDATES) {
    try {
      const content = await readFile(filePath);
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch {
      // Try next candidate path
    }
  }

  return new Response('Logo not found', { status: 404 });
}
