import { describe, expect, it } from 'vitest';
import {
  approvedProviderProfile,
  approvedRuntimeProfile,
  createOpaqueSecret,
  digestSecret,
  normalizeLaunchLanguage,
  integratedTranslationTargetApproved,
  liveKitMediaPlaneRevocationApproved,
  oppositeLanguage,
  providerSessionAllowedCurrentStates,
  secretDigestMatches,
  reserveInterpretationBudgetMicrodollars,
  selfHostedJoinTokenTtlSeconds,
  VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED,
  VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED,
  HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED,
} from '../video-interpretation/security.js';
import interpretationRoutes, {
  selfHostSchema,
} from '../routes/video-interpretation.routes.js';

describe('video interpretation security helpers', () => {
  it('keeps the supplied self-host supervisor at one concurrent job', () => {
    expect(selfHostSchema.parse({ hostName: 'low-cost-host' }).maxJobs).toBe(1);
    expect(selfHostSchema.parse({ hostName: 'low-cost-host', maxJobs: 1 }).maxJobs).toBe(1);
    expect(() => selfHostSchema.parse({ hostName: 'low-cost-host', maxJobs: 2 })).toThrow();
  });

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

  it('does not silently fall back to hosted when a requested self-host runtime is unapproved', () => {
    const oldApproved = process.env.VIDEO_INTERPRETATION_SELF_HOST_APPROVED;
    const oldProfile = process.env.VIDEO_INTERPRETATION_RUNTIME_PROFILE;
    const oldUrl = process.env.LIVEKIT_URL;
    const oldRevocation = process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED;
    try {
      process.env.VIDEO_INTERPRETATION_SELF_HOST_APPROVED = 'false';
      process.env.VIDEO_INTERPRETATION_RUNTIME_PROFILE = 'SELF_HOSTED_AGENT';
      process.env.LIVEKIT_URL = 'wss://medora.livekit.cloud';
      process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED = 'false';
      expect(approvedRuntimeProfile()).toBe('DISABLED');
      process.env.VIDEO_INTERPRETATION_SELF_HOST_APPROVED = 'true';
      expect(approvedRuntimeProfile()).toBe('DISABLED');
      process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED = 'true';
      expect(approvedRuntimeProfile()).toBe('SELF_HOSTED_AGENT');
    } finally {
      if (oldApproved === undefined) delete process.env.VIDEO_INTERPRETATION_SELF_HOST_APPROVED;
      else process.env.VIDEO_INTERPRETATION_SELF_HOST_APPROVED = oldApproved;
      if (oldProfile === undefined) delete process.env.VIDEO_INTERPRETATION_RUNTIME_PROFILE;
      else process.env.VIDEO_INTERPRETATION_RUNTIME_PROFILE = oldProfile;
      if (oldUrl === undefined) delete process.env.LIVEKIT_URL;
      else process.env.LIVEKIT_URL = oldUrl;
      if (oldRevocation === undefined) delete process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED;
      else process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED = oldRevocation;
    }
  });

  it('rejects either runtime media plane without explicit LiveKit Cloud revocation proof', () => {
    const old = process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED;
    try {
      process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED = 'true';
      expect(liveKitMediaPlaneRevocationApproved('wss://medora.livekit.cloud')).toBe(true);
      expect(liveKitMediaPlaneRevocationApproved('ws://medora.livekit.cloud')).toBe(false);
      expect(liveKitMediaPlaneRevocationApproved('wss://self-hosted.example')).toBe(false);
      expect(liveKitMediaPlaneRevocationApproved('wss://foo.livekit.cloud.evil.example')).toBe(false);
      expect(liveKitMediaPlaneRevocationApproved(undefined)).toBe(false);
      process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED = 'false';
      expect(liveKitMediaPlaneRevocationApproved('wss://medora.livekit.cloud')).toBe(false);
    } finally {
      if (old === undefined) delete process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED;
      else process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED = old;
    }
  });

  it('bounds an initial self-host join token to the remaining lease', () => {
    const now = Date.parse('2026-08-29T00:00:00.000Z');
    expect(selfHostedJoinTokenTtlSeconds('2026-08-29T00:00:29.900Z', now)).toBe(29);
    expect(selfHostedJoinTokenTtlSeconds('2026-08-29T00:01:00.000Z', now)).toBe(30);
    expect(() => selfHostedJoinTokenTtlSeconds('2026-08-29T00:00:00.900Z', now)).toThrow();
  });

  it('pins provider egress and reserves two streams plus a safety margin', () => {
    expect(integratedTranslationTargetApproved(
      'gpt-realtime-translate',
      'wss://api.openai.com/v1/realtime/translations',
    )).toBe(true);
    expect(integratedTranslationTargetApproved(
      'gpt-realtime-translate',
      'wss://attacker.example/v1/realtime/translations',
    )).toBe(false);
    expect(integratedTranslationTargetApproved(
      'other-model',
      'wss://api.openai.com/v1/realtime/translations',
    )).toBe(false);
    expect(reserveInterpretationBudgetMicrodollars(1_800, 34_000)).toBe(2_244_000);
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
      expect(VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED).toBe(false);
      expect(HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED).toBe(false);
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
