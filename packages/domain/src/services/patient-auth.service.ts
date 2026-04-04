import * as jose from 'jose';

export interface PatientSessionPayload {
  userId: string;
  role: 'PATIENT';
  exp: number;
}

export interface MagicLinkPayload {
  email: string;
  purpose: 'patient-login';
  exp: number;
}

export interface PatientEntryTokenPayload {
  email: string;
  purpose: 'patient-login' | 'patient-register';
  exp: number;
}

export interface GuestRestoreCookiePayload {
  userId: string;
  purpose: 'guest-restore-cookie';
  restoreToken: string;
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
    try {
      const { payload } = await jose.jwtVerify(token, this.secret);
      const parsed = payload as unknown as PatientSessionPayload;
      if (parsed.role !== 'PATIENT') throw new Error('Invalid session token');
      return parsed;
    } catch {
      throw new Error('Invalid session token');
    }
  }

  async createMagicLinkToken(email: string): Promise<string> {
    return await this.createPatientLoginToken(email);
  }

  async createPatientLoginToken(email: string): Promise<string> {
    return await new jose.SignJWT({ email, purpose: 'patient-login' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(this.secret);
  }

  async createPatientRegisterToken(email: string): Promise<string> {
    return await new jose.SignJWT({ email, purpose: 'patient-register' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(this.secret);
  }

  async verifyMagicLinkToken(token: string): Promise<MagicLinkPayload> {
    const parsed = await this.verifyPatientEntryToken(token);
    if (parsed.purpose !== 'patient-login') {
      throw new Error('Invalid token purpose');
    }
    return parsed;
  }

  async verifyPatientEntryToken(token: string): Promise<PatientEntryTokenPayload> {
    const { payload } = await jose.jwtVerify(token, this.secret);
    const parsed = payload as unknown as PatientEntryTokenPayload;
    if (parsed.purpose !== 'patient-login' && parsed.purpose !== 'patient-register') {
      throw new Error('Invalid token purpose');
    }
    return parsed;
  }

  private generateOpaqueRestoreToken(): string {
    const cryptoApi = globalThis as typeof globalThis & {
      crypto: {
        randomUUID(): string;
      };
    };
    return cryptoApi.crypto.randomUUID().replace(/-/g, '');
  }

  async createGuestRestoreToken(): Promise<string> {
    return this.generateOpaqueRestoreToken();
  }

  async createGuestRestoreCookie(userId: string, restoreToken: string, expiresInHours = 24): Promise<string> {
    return await new jose.SignJWT({ userId, purpose: 'guest-restore-cookie', restoreToken })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${expiresInHours}h`)
      .sign(this.secret);
  }

  async createGuestRestoreArtifacts(
    userId: string,
    expiresInHours = 24,
  ): Promise<{ restoreToken: string; restoreCookie: string }> {
    const restoreToken = await this.createGuestRestoreToken();
    const restoreCookie = await this.createGuestRestoreCookie(userId, restoreToken, expiresInHours);
    return { restoreToken, restoreCookie };
  }

  async verifyGuestRestoreCookie(
    restoreCookie: string,
    restoreToken: string,
  ): Promise<GuestRestoreCookiePayload> {
    try {
      const { payload } = await jose.jwtVerify(restoreCookie, this.secret);
      const parsed = payload as unknown as GuestRestoreCookiePayload;
      if (parsed.purpose !== 'guest-restore-cookie') throw new Error('Invalid restore cookie');
      if (parsed.restoreToken !== restoreToken) throw new Error('Restore token mismatch');
      return parsed;
    } catch (error) {
      if (error instanceof Error && error.message === 'Restore token mismatch') {
        throw error;
      }
      throw new Error('Invalid restore cookie');
    }
  }
}
