import * as jose from 'jose';

export interface PatientSessionPayload {
  userId: string;
  role: 'PATIENT';
  exp: number;
}

export interface MagicLinkPayload {
  email: string;
  purpose: 'magic-link';
  exp: number;
}

export class PatientAuthService {
  private readonly secret: Uint8Array;

  constructor(secret: string) {
    this.secret = new TextEncoder().encode(secret);
  }

  async createSessionToken(userId: string, expiresInHours = 24): Promise<string> {
    return await new jose.SignJWT({ userId, role: 'PATIENT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${expiresInHours}h`)
      .sign(this.secret);
  }

  async verifySessionToken(token: string): Promise<PatientSessionPayload> {
    const { payload } = await jose.jwtVerify(token, this.secret);
    return payload as unknown as PatientSessionPayload;
  }

  async createMagicLinkToken(email: string): Promise<string> {
    return await new jose.SignJWT({ email, purpose: 'magic-link' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(this.secret);
  }

  async verifyMagicLinkToken(token: string): Promise<MagicLinkPayload> {
    const { payload } = await jose.jwtVerify(token, this.secret);
    const parsed = payload as unknown as MagicLinkPayload;
    if (parsed.purpose !== 'magic-link') throw new Error('Invalid token purpose');
    return parsed;
  }
}
