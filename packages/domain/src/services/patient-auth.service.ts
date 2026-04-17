import * as jose from 'jose';

import type { PatientSite } from '../ports/patient-repository.port.js';

export interface PatientSessionPayload {
  userId: string;
  role: 'PATIENT';
  site: PatientSite;
  exp: number;
}

export interface MagicLinkPayload {
  email: string;
  purpose: 'patient-login';
  site: PatientSite;
  exp: number;
}

export interface PatientEntryTokenPayload {
  email: string;
  purpose: 'patient-login' | 'patient-register';
  site: PatientSite;
  exp: number;
}

export interface GuestRestoreCookiePayload {
  userId: string;
  purpose: 'guest-restore-cookie';
  site: PatientSite;
  restoreToken: string;
  exp: number;
}

export class PatientAuthService {
  private readonly secret: Uint8Array;

  constructor(secret: string) {
    this.secret = new TextEncoder().encode(secret);
  }

  async createSessionToken(userId: string, site: PatientSite, expiresInHours = 24): Promise<string> {
    return await new jose.SignJWT({ userId, role: 'PATIENT', site })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${expiresInHours}h`)
      .sign(this.secret);
  }

  async verifySessionToken(token: string, site: PatientSite): Promise<PatientSessionPayload> {
    try {
      const { payload } = await jose.jwtVerify(token, this.secret);
      const parsed = payload as unknown as PatientSessionPayload;
      if (parsed.role !== 'PATIENT') throw new Error('Invalid session token');
      if (parsed.site !== site) throw new Error('Invalid session token');
      return parsed;
    } catch {
      throw new Error('Invalid session token');
    }
  }

  async createMagicLinkToken(email: string, site: PatientSite): Promise<string> {
    return await this.createPatientLoginToken(email, site);
  }

  async createPatientLoginToken(email: string, site: PatientSite): Promise<string> {
    return await new jose.SignJWT({ email, site, purpose: 'patient-login' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(this.secret);
  }

  async createPatientRegisterToken(email: string, site: PatientSite): Promise<string> {
    return await new jose.SignJWT({ email, site, purpose: 'patient-register' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(this.secret);
  }

  async verifyMagicLinkToken(token: string, site: PatientSite): Promise<MagicLinkPayload> {
    const parsed = await this.verifyPatientEntryToken(token, site);
    if (parsed.purpose !== 'patient-login') {
      throw new Error('Invalid token purpose');
    }
    return {
      email: parsed.email,
      purpose: 'patient-login',
      site: parsed.site,
      exp: parsed.exp,
    };
  }

  async verifyPatientEntryToken(token: string, site: PatientSite): Promise<PatientEntryTokenPayload> {
    const { payload } = await jose.jwtVerify(token, this.secret);
    const parsed = payload as unknown as PatientEntryTokenPayload;
    if (parsed.purpose !== 'patient-login' && parsed.purpose !== 'patient-register') {
      throw new Error('Invalid token purpose');
    }
    if (parsed.site !== site) {
      throw new Error('Invalid token site');
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

  async createGuestRestoreCookie(userId: string, site: PatientSite, restoreToken: string, expiresInHours = 24): Promise<string> {
    return await new jose.SignJWT({ userId, site, purpose: 'guest-restore-cookie', restoreToken })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${expiresInHours}h`)
      .sign(this.secret);
  }

  async createGuestRestoreArtifacts(
    userId: string,
    site: PatientSite,
    expiresInHours = 24,
  ): Promise<{ restoreToken: string; restoreCookie: string }> {
    const restoreToken = await this.createGuestRestoreToken();
    const restoreCookie = await this.createGuestRestoreCookie(userId, site, restoreToken, expiresInHours);
    return { restoreToken, restoreCookie };
  }

  async verifyGuestRestoreCookie(
    restoreCookie: string,
    restoreToken: string,
    site: PatientSite,
  ): Promise<GuestRestoreCookiePayload> {
    try {
      const { payload } = await jose.jwtVerify(restoreCookie, this.secret);
      const parsed = payload as unknown as GuestRestoreCookiePayload;
      if (parsed.purpose !== 'guest-restore-cookie') throw new Error('Invalid restore cookie');
      if (parsed.restoreToken !== restoreToken) throw new Error('Restore token mismatch');
      if (parsed.site !== site) throw new Error('Invalid restore cookie');
      return parsed;
    } catch (error) {
      if (error instanceof Error && error.message === 'Restore token mismatch') {
        throw error;
      }
      throw new Error('Invalid restore cookie');
    }
  }
}
