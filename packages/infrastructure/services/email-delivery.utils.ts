const EMAIL_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env['EMAIL_REQUEST_TIMEOUT_MS'] ?? '8000',
  10,
);

export async function fetchWithEmailTimeout(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Email provider request timed out after ${EMAIL_REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
