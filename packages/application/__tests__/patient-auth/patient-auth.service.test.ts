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
});
