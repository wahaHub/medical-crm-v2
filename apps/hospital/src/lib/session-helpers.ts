import { getSession } from './session';

/** Decode hospitalId from the session JWT access token. */
export async function getSessionHospitalId(): Promise<string | null> {
  const session = await getSession();
  if (!session.access_token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split('.')[1] ?? '', 'base64url').toString()
    );
    return (payload.hospital_id as string) ?? null;
  } catch {
    return null;
  }
}
