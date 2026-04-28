import { NextRequest } from 'next/server';

export async function GET(request: NextRequest): Promise<Response> {
  void request;
  return Response.json(
    { error: 'Legacy URL preview is disabled. Use case document preview routes.' },
    { status: 410 },
  );
}
