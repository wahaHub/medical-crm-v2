import { describe, expect, it, vi } from 'vitest';
import {
  AdminPatientSiteAccessPolicy,
  getAdminPatientSiteScope,
  isPatientSiteAllowedByScope,
} from '../src/access/admin-patient-site-access.js';
import type { Actor } from '../src/types/actor.js';

const regularAdmin: Actor = {
  userId: 'admin-1',
  email: 'contact@medicaltourismchina.health',
  role: 'ADMIN',
  hospitalId: null,
};

const beautyAdmin: Actor = {
  userId: 'admin-2',
  email: 'CONTACT@MEDORABEAUTY.COM',
  role: 'ADMIN',
  hospitalId: null,
};

describe('admin patient site access', () => {
  it('derives beauty-only scope from exact medorabeauty email domain', () => {
    expect(getAdminPatientSiteScope(beautyAdmin)).toEqual({ mode: 'ONLY', site: 'beauty' });
  });

  it('derives non-beauty scope from every other admin email', () => {
    expect(getAdminPatientSiteScope(regularAdmin)).toEqual({ mode: 'EXCLUDE', site: 'beauty' });
    expect(getAdminPatientSiteScope({ ...regularAdmin, email: 'admin@sub.medorabeauty.com' }))
      .toEqual({ mode: 'EXCLUDE', site: 'beauty' });
    expect(getAdminPatientSiteScope({ ...regularAdmin, email: 'admin@fake-medorabeauty.com' }))
      .toEqual({ mode: 'EXCLUDE', site: 'beauty' });
  });

  it('treats null patient site as non-beauty', () => {
    expect(isPatientSiteAllowedByScope({ mode: 'EXCLUDE', site: 'beauty' }, null)).toBe(true);
    expect(isPatientSiteAllowedByScope({ mode: 'ONLY', site: 'beauty' }, null)).toBe(false);
  });

  it('returns null scope for non-admin actors', () => {
    expect(getAdminPatientSiteScope({ ...regularAdmin, role: 'PATIENT' })).toBeNull();
  });

  it('blocks cross-scope case access', async () => {
    const caseRepo = { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) };
    const userRepo = { findById: vi.fn().mockResolvedValue({ id: 'patient-1', patientSite: 'beauty' }) };
    const policy = new AdminPatientSiteAccessPolicy(caseRepo as never, userRepo as never);

    await expect(policy.assertActorCanAccessCase(regularAdmin, 'case-1'))
      .rejects.toThrow('Access denied to this case scope');
  });

  it('treats example.com patient cases as missing for shared case-page access', async () => {
    const caseRepo = { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) };
    const userRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'patient-1',
        email: 'patient@example.com',
        patientSite: 'china',
      }),
    };
    const policy = new AdminPatientSiteAccessPolicy(caseRepo as never, userRepo as never);

    await expect(policy.assertCaseNotExcludedByPatientEmail({ id: 'case-1', patientId: 'patient-1' } as never))
      .rejects.toThrow('Case case-1 not found');
  });

  it('allows in-scope case and patient access', async () => {
    const caseRepo = { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) };
    const userRepo = { findById: vi.fn().mockResolvedValue({ id: 'patient-1', patientSite: 'beauty' }) };
    const policy = new AdminPatientSiteAccessPolicy(caseRepo as never, userRepo as never);

    await expect(policy.assertActorCanAccessCase(beautyAdmin, 'case-1')).resolves.toMatchObject({ id: 'case-1' });
    await expect(policy.assertActorCanAccessPatient(beautyAdmin, 'patient-1')).resolves.toBeUndefined();
  });

  it('fails missing patients explicitly', async () => {
    const caseRepo = { findById: vi.fn() };
    const userRepo = { findById: vi.fn().mockResolvedValue(null) };
    const policy = new AdminPatientSiteAccessPolicy(caseRepo as never, userRepo as never);

    await expect(policy.assertActorCanAccessPatient(beautyAdmin, 'missing-patient'))
      .rejects.toThrow('Patient missing-patient not found');
  });
});
