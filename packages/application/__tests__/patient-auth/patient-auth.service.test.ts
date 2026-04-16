import { describe, it, expect } from 'vitest';
import { PatientAuthService } from '@medical-crm/domain';

describe('PatientAuthService', () => {
  it('generates a JWT with userId and role PATIENT', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createSessionToken('user-123', 'beauty');
    const payload = await service.verifySessionToken(token, 'beauty');
    expect(payload.userId).toBe('user-123');
    expect(payload.role).toBe('PATIENT');
    expect(payload.site).toBe('beauty');
  });

  it('throws on expired token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createSessionToken('user-123', 'beauty', -1); // expired
    await expect(service.verifySessionToken(token, 'beauty')).rejects.toThrow();
  });

  it('generates a site-aware magic link token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createMagicLinkToken('test@email.com', 'china');
    const payload = await service.verifyMagicLinkToken(token, 'china');
    expect(payload.email).toBe('test@email.com');
    expect(payload.site).toBe('china');
  });

  it('round-trips a patient-register token through verifyPatientEntryToken', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createPatientRegisterToken('register@email.com', 'beauty');

    const payload = await service.verifyPatientEntryToken(token, 'beauty');

    expect(payload.email).toBe('register@email.com');
    expect(payload.purpose).toBe('patient-register');
    expect(payload.site).toBe('beauty');
  });

  it('verifyPatientEntryToken accepts both patient-login and patient-register purposes', async () => {
    const service = new PatientAuthService('test-secret');
    const loginToken = await service.createPatientLoginToken('login@email.com', 'beauty');
    const registerToken = await service.createPatientRegisterToken('register@email.com', 'china');

    await expect(service.verifyPatientEntryToken(loginToken, 'beauty')).resolves.toMatchObject({
      email: 'login@email.com',
      purpose: 'patient-login',
      site: 'beauty',
    });
    await expect(service.verifyPatientEntryToken(registerToken, 'china')).resolves.toMatchObject({
      email: 'register@email.com',
      purpose: 'patient-register',
      site: 'china',
    });
  });

  it('verifyMagicLinkToken rejects a patient-register token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createPatientRegisterToken('register@email.com', 'beauty');

    await expect(service.verifyMagicLinkToken(token, 'beauty')).rejects.toThrow('Invalid token purpose');
  });

  it('rejects patient tokens on the wrong site', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createSessionToken('user-123', 'beauty');

    await expect(service.verifySessionToken(token, 'china')).rejects.toThrow('Invalid session token');
  });

  it('creates site-aware guest restore artifacts and verifies the restore cookie', async () => {
    const service = new PatientAuthService('test-secret');
    const { restoreToken, restoreCookie } = await service.createGuestRestoreArtifacts('patient-123', 'beauty');

    const payload = await service.verifyGuestRestoreCookie(restoreCookie, restoreToken, 'beauty');

    expect(restoreToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(payload.userId).toBe('patient-123');
    expect(payload.purpose).toBe('guest-restore-cookie');
    expect(payload.site).toBe('beauty');
  });

  it('rejects restore tokens as patient session tokens', async () => {
    const service = new PatientAuthService('test-secret');
    const restoreToken = await service.createGuestRestoreToken();

    await expect(service.verifySessionToken(restoreToken, 'beauty')).rejects.toThrow('Invalid session token');
  });

  it('rejects restore cookie verification when the token mismatches', async () => {
    const service = new PatientAuthService('test-secret');
    const restoreToken = await service.createGuestRestoreToken();
    const restoreCookie = await service.createGuestRestoreCookie('patient-123', 'beauty', restoreToken);

    await expect(service.verifyGuestRestoreCookie(restoreCookie, 'different-token', 'beauty')).rejects.toThrow('Restore token mismatch');
  });

  it('rejects restore cookie verification on the wrong site', async () => {
    const service = new PatientAuthService('test-secret');
    const { restoreToken, restoreCookie } = await service.createGuestRestoreArtifacts('patient-123', 'beauty');

    await expect(service.verifyGuestRestoreCookie(restoreCookie, restoreToken, 'china')).rejects.toThrow('Invalid restore cookie');
  });
});
