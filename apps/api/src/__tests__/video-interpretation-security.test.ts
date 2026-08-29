import { describe, expect, it } from 'vitest';
import {
  approvedProviderProfile,
  createOpaqueSecret,
  digestSecret,
  normalizeLaunchLanguage,
  oppositeLanguage,
  providerSessionAllowedCurrentStates,
  secretDigestMatches,
  VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
} from '../video-interpretation/security.js';
import interpretationRoutes from '../routes/video-interpretation.routes.js';

describe('video interpretation security helpers', () => {
  it('stores and compares only secret digests', () => {
    const secret = createOpaqueSecret();
    const digest = digestSecret(secret);
    expect(secret).not.toBe(digest);
    expect(secretDigestMatches(secret, digest)).toBe(true);
    expect(secretDigestMatches(`${secret}x`, digest)).toBe(false);
    expect(secretDigestMatches(secret, 'not-a-digest')).toBe(false);
  });

  it('allows only the launch languages', () => {
    expect(normalizeLaunchLanguage('zh-CN')).toBe('zh');
    expect(normalizeLaunchLanguage('English')).toBe('en');
    expect(normalizeLaunchLanguage('id')).toBeNull();
    expect(oppositeLanguage('zh')).toBe('en');
  });

  it('keeps the provider disabled unless both approval gates are explicit', () => {
    const oldApproved = process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED;
    const oldProfile = process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE;
    try {
      process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED = 'false';
      process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE = 'INTEGRATED_REALTIME';
      expect(approvedProviderProfile()).toBe('DISABLED');
      process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED = 'true';
      expect(approvedProviderProfile()).toBe('INTEGRATED_REALTIME');
    } finally {
      if (oldApproved === undefined) delete process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED;
      else process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED = oldApproved;
      if (oldProfile === undefined) delete process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE;
      else process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE = oldProfile;
    }
  });

  it('cannot enable the incomplete media adapter with environment flags', async () => {
    const oldEnabled = process.env.VIDEO_INTERPRETATION_ENABLED;
    const oldApproved = process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED;
    const oldProfile = process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE;
    try {
      process.env.VIDEO_INTERPRETATION_ENABLED = 'true';
      process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED = 'true';
      process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE = 'INTEGRATED_REALTIME';
      expect(VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED).toBe(false);
      const response = await interpretationRoutes.request(
        '/api/v2/video-consultations/00000000-0000-4000-8000-000000000001/interpretation/start',
        { method: 'POST', body: '{}' },
      );
      expect(response.status).toBe(503);
      expect(await response.text()).toContain('VIDEO_INTERPRETATION_SCAFFOLD_ONLY');
    } finally {
      if (oldEnabled === undefined) delete process.env.VIDEO_INTERPRETATION_ENABLED;
      else process.env.VIDEO_INTERPRETATION_ENABLED = oldEnabled;
      if (oldApproved === undefined) delete process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED;
      else process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED = oldApproved;
      if (oldProfile === undefined) delete process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE;
      else process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE = oldProfile;
    }
  });

  it('does not let an agent relabel an uncertain provider session as failed or closed', () => {
    expect(providerSessionAllowedCurrentStates('CLOSING')).toEqual(['CREATING', 'ACTIVE']);
    expect(providerSessionAllowedCurrentStates('CLOSED')).toEqual(['CLOSING', 'ORPHAN_WAIT']);
    expect(providerSessionAllowedCurrentStates('ORPHAN_WAIT')).toContain('ACTIVE');
  });
});
