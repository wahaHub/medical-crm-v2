import { describe, expect, it } from 'vitest';
import {
  approvedProviderProfile,
  approvedRuntimeProfile,
  createOpaqueSecret,
  deidentifiedE2eModeEnabled,
  digestSecret,
  normalizeLaunchLanguage,
  integratedTranslationTargetApproved,
  liveKitMediaPlaneRevocationApproved,
  oppositeLanguage,
  providerSessionAllowedCurrentStates,
  secretDigestMatches,
  MAX_DEIDENTIFIED_E2E_ACTIVE_AI_ROOMS,
  MAX_DEIDENTIFIED_E2E_AUTHORITY_LIFETIME_SECONDS,
  MAX_DEIDENTIFIED_E2E_DURATION_SECONDS,
  reserveInterpretationBudgetMicrodollars,
  selfHostedJoinTokenTtlSeconds,
  syntheticDeidentifiedE2eConsultationApproved,
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

  it('keeps REAL_PATIENT and authentication closed after media qualification', async () => {
    const oldEnabled = process.env.VIDEO_INTERPRETATION_ENABLED;
    const oldApproved = process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED;
    const oldProfile = process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE;
    try {
      process.env.VIDEO_INTERPRETATION_ENABLED = 'true';
      process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED = 'true';
      process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE = 'INTEGRATED_REALTIME';
      // Media adapter and dispatch absence bound were qualified by executable
      // probes on 2026-08-30; REAL_PATIENT release remains a hard code gate.
      expect(VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED).toBe(true);
      expect(VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED).toBe(false);
      expect(HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED).toBe(true);
      const response = await interpretationRoutes.request(
        '/api/v2/video-consultations/00000000-0000-4000-8000-000000000001/interpretation/start',
        { method: 'POST', body: '{}' },
      );
      // The scaffold gate is gone, but a request without a session must still
      // be rejected before any control-plane mutation. In production the auth
      // middleware answers 401 first; this bare-mounted test app reaches
      // requireOperator, which throws on the missing session (500).
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('VIDEO_INTERPRETATION_SCAFFOLD_ONLY');
    } finally {
      if (oldEnabled === undefined) delete process.env.VIDEO_INTERPRETATION_ENABLED;
      else process.env.VIDEO_INTERPRETATION_ENABLED = oldEnabled;
      if (oldApproved === undefined) delete process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED;
      else process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED = oldApproved;
      if (oldProfile === undefined) delete process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE;
      else process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE = oldProfile;
    }
  });

  it('requires both staging tier and the explicit flag for the bounded de-identified E2E mode', () => {
    const oldTier = process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER;
    const oldEnabled = process.env.VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED;
    try {
      process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER = 'PRODUCTION';
      process.env.VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED = 'true';
      expect(deidentifiedE2eModeEnabled()).toBe(false);
      process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER = 'STAGING';
      expect(deidentifiedE2eModeEnabled()).toBe(true);
      process.env.VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED = 'false';
      expect(deidentifiedE2eModeEnabled()).toBe(false);
      expect(MAX_DEIDENTIFIED_E2E_DURATION_SECONDS).toBe(300);
      expect(MAX_DEIDENTIFIED_E2E_AUTHORITY_LIFETIME_SECONDS).toBe(1_800);
      expect(MAX_DEIDENTIFIED_E2E_ACTIVE_AI_ROOMS).toBe(1);
      expect(VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED).toBe(true);
      expect(VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED).toBe(false);
      expect(HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED).toBe(true);
    } finally {
      if (oldTier === undefined) delete process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER;
      else process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER = oldTier;
      if (oldEnabled === undefined) delete process.env.VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED;
      else process.env.VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED = oldEnabled;
    }
  });

  it('binds the staging waiver to a short-lived server-owned synthetic consultation', () => {
    const now = Date.parse('2026-08-30T14:00:00.000Z');
    const valid = {
      room_name: 'medora-deidentified-e2e-0123456789abcdef',
      status: 'IN_PROGRESS',
      case_id: null,
      patient_id: null,
      patient_name: null,
      patient_email: null,
      metadata: {
        synthetic: true,
        classification: 'DEIDENTIFIED_EVALUATION',
        expiresAt: '2026-08-30T14:25:00.000Z',
      },
    };
    expect(syntheticDeidentifiedE2eConsultationApproved(valid, now)).toBe(true);
    expect(syntheticDeidentifiedE2eConsultationApproved({
      ...valid,
      patient_name: 'Real Patient',
    }, now)).toBe(false);
    expect(syntheticDeidentifiedE2eConsultationApproved({
      ...valid,
      room_name: 'consultation-real-room',
    }, now)).toBe(false);
    expect(syntheticDeidentifiedE2eConsultationApproved({
      ...valid,
      metadata: { ...valid.metadata, synthetic: false },
    }, now)).toBe(false);
    expect(syntheticDeidentifiedE2eConsultationApproved({
      ...valid,
      metadata: { ...valid.metadata, expiresAt: '2026-08-30T14:30:00.001Z' },
    }, now)).toBe(false);
  });

  it('does not let an agent relabel an uncertain provider session as failed or closed', () => {
    expect(providerSessionAllowedCurrentStates('CLOSING')).toEqual(['CREATING', 'ACTIVE']);
    expect(providerSessionAllowedCurrentStates('CLOSED')).toEqual(['CLOSING', 'ORPHAN_WAIT']);
    expect(providerSessionAllowedCurrentStates('ORPHAN_WAIT')).toContain('ACTIVE');
  });
});
