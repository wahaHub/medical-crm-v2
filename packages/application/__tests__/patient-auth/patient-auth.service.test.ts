import { describe, it, expect } from 'vitest';
import { PatientAuthService } from '@medical-crm/domain';

describe('PatientAuthService', () => {
  it('generates a JWT with userId and role PATIENT', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createSessionToken('user-123');
    const payload = await service.verifySessionToken(token);
    expect(payload.userId).toBe('user-123');
    expect(payload.role).toBe('PATIENT');
  });

  it('throws on expired token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createSessionToken('user-123', -1); // expired
    await expect(service.verifySessionToken(token)).rejects.toThrow();
  });

  it('generates a magic link token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createMagicLinkToken('test@email.com');
    const payload = await service.verifyMagicLinkToken(token);
    expect(payload.email).toBe('test@email.com');
  });

  it('round-trips a patient-register token through verifyPatientEntryToken', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createPatientRegisterToken('register@email.com');

    const payload = await service.verifyPatientEntryToken(token);

    expect(payload.email).toBe('register@email.com');
    expect(payload.purpose).toBe('patient-register');
  });

  it('verifyPatientEntryToken accepts both patient-login and patient-register purposes', async () => {
    const service = new PatientAuthService('test-secret');
    const loginToken = await service.createPatientLoginToken('login@email.com');
    const registerToken = await service.createPatientRegisterToken('register@email.com');

    await expect(service.verifyPatientEntryToken(loginToken)).resolves.toMatchObject({
      email: 'login@email.com',
      purpose: 'patient-login',
    });
    await expect(service.verifyPatientEntryToken(registerToken)).resolves.toMatchObject({
      email: 'register@email.com',
      purpose: 'patient-register',
    });
  });

  it('verifyMagicLinkToken rejects a patient-register token', async () => {
    const service = new PatientAuthService('test-secret');
    const token = await service.createPatientRegisterToken('register@email.com');

    await expect(service.verifyMagicLinkToken(token)).rejects.toThrow('Invalid token purpose');
  });

  it('creates guest restore artifacts and verifies the restore cookie', async () => {
    const service = new PatientAuthService('test-secret');
    const { restoreToken, restoreCookie } = await service.createGuestRestoreArtifacts('patient-123');

    const payload = await service.verifyGuestRestoreCookie(restoreCookie, restoreToken);

    expect(restoreToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(payload.userId).toBe('patient-123');
    expect(payload.purpose).toBe('guest-restore-cookie');
  });

  it('rejects restore tokens as patient session tokens', async () => {
    const service = new PatientAuthService('test-secret');
    const restoreToken = await service.createGuestRestoreToken();

    await expect(service.verifySessionToken(restoreToken)).rejects.toThrow('Invalid session token');
  });

  it('rejects restore cookie verification when the token mismatches', async () => {
    const service = new PatientAuthService('test-secret');
    const restoreToken = await service.createGuestRestoreToken();
    const restoreCookie = await service.createGuestRestoreCookie('patient-123', restoreToken);

    await expect(service.verifyGuestRestoreCookie(restoreCookie, 'different-token')).rejects.toThrow('Restore token mismatch');
  });
});
