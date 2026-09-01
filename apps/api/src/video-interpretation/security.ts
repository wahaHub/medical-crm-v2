import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const INTERPRETATION_POLICY_VERSION = 'video-ai-consent-v1';
export const MAX_ACTIVE_AI_ROOMS = 2;
export const MAX_DEIDENTIFIED_E2E_ACTIVE_AI_ROOMS = 1;
export const MAX_DEIDENTIFIED_E2E_DURATION_SECONDS = 300;
export const MAX_DEIDENTIFIED_E2E_AUTHORITY_LIFETIME_SECONDS = 1_800;
export const MAX_PROVIDER_SESSIONS_PER_ROOM = 2;
// Server-owned fallback for the pinned /v1/realtime/translations profile:
// two hours maximum lifetime plus five minutes for skew/drain. The production
// media gate must remain false until the exact endpoint/model contract and an
// executable probe prove that this bound cannot be extended by the provider.
export const OPENAI_TRANSLATION_CONSERVATIVE_EXPIRY_SECONDS = (2 * 60 + 5) * 60;
// Watchdog budget tuned to the production topology: the CRM database is
// Supabase us-east-2 while the API/agent run in us-west-2, so each SQL round
// trip costs ~400 ms and a single authorization pass (several statements)
// lands at 500-900 ms. The original 400 ms ceiling was authored against a
// low-latency database. maxRttMs=2000 accepts the observed p99 with margin,
// intervalMs=1000 halves load, and ttlMs=5000 tolerates two consecutive
// rejected/slow polls before authority lapses. Worst-case stale-authority
// bound: ~5 s plus the 1 s room-listing cache TTL.
export const WATCHDOG_INTERVAL_MS = 1_000;
export const WATCHDOG_MAX_RTT_MS = 2_000;
export const WATCHDOG_AUTHORIZATION_TTL_MS = 5_000;

// Qualified on 2026-08-30 by executable evidence: the de-identified OpenAI
// probe (probe:translation, en→zh) passed from the production host with
// accurate source transcription and translated audio; the de-identified
// LiveKit room probe then verified translated audio and subtitle messages.
// Runtime release still requires independent feature, provider, approval,
// allowlist, capacity, and classification gates. Patient audio additionally
// requires the separate REAL_PATIENT release gate below.
export const VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED = true;
// REAL_PATIENT release remains a code gate. Database attestations and
// environment flags are necessary but cannot independently authorize PHI or
// self-hosted execution.
export const VIDEO_INTERPRETATION_REAL_PATIENT_RELEASE_IMPLEMENTED = false;
export const VIDEO_INTERPRETATION_SELF_HOSTED_RUNTIME_IMPLEMENTED = true;
export const SELF_HOST_LEASE_SECONDS = 30;
export const SELF_HOST_HEARTBEAT_SECONDS = 10;
export const SELF_HOST_CLAIM_TIMEOUT_SECONDS = 60;
export const LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS = 10;
export const HOSTED_DISPATCH_RECOVERY_SETTLE_SECONDS = 30;
export const HOSTED_BOOTSTRAP_TIMEOUT_SECONDS = 60;
export const LIFECYCLE_RECONCILER_STALE_SECONDS = 90;
// Verified on 2026-08-30 by probe:dispatch-absence against the production
// LiveKit Cloud project: n=20, post-create list visibility max 2101ms
// (p95 1823ms), suggested bound max+3*p95 = 7570ms. The 30s settle window
// above exceeds the measured bound with wide margin, so a zero-match dispatch
// recovery may release capacity after the settle window.
export const HOSTED_DISPATCH_ABSENCE_BOUND_VERIFIED = true;
export const VIDEO_INTERPRETATION_BUDGET_SAFETY_BASIS_POINTS = 11_000;

export type ProviderSessionMutableState = 'CREATING' | 'ACTIVE' | 'CLOSING' | 'ORPHAN_WAIT';
export type ProviderSessionAgentTransition = 'CLOSING' | 'CLOSED' | 'ORPHAN_WAIT';

export function providerSessionAllowedCurrentStates(
  next: ProviderSessionAgentTransition,
): ProviderSessionMutableState[] {
  if (next === 'CLOSING') return ['CREATING', 'ACTIVE'];
  if (next === 'CLOSED') return ['CLOSING', 'ORPHAN_WAIT'];
  return ['CREATING', 'ACTIVE', 'CLOSING', 'ORPHAN_WAIT'];
}

export function digestSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function createOpaqueSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function secretDigestMatches(secret: string, expectedHexDigest: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHexDigest)) return false;
  const actual = Buffer.from(digestSecret(secret), 'hex');
  const expected = Buffer.from(expectedHexDigest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeLaunchLanguage(language: string | null | undefined): 'zh' | 'en' | null {
  if (!language) return null;
  const normalized = language.trim().toLowerCase();
  if (normalized === 'zh' || normalized.startsWith('zh-') || normalized === 'chinese') return 'zh';
  if (normalized === 'en' || normalized.startsWith('en-') || normalized === 'english') return 'en';
  return null;
}

export function oppositeLanguage(language: 'zh' | 'en'): 'zh' | 'en' {
  return language === 'zh' ? 'en' : 'zh';
}

export function interpretationFeatureEnabled(): boolean {
  return process.env.VIDEO_INTERPRETATION_ENABLED === 'true';
}

/** Human RTC access is independent from AI and remains fail-closed in prod. */
export function videoConsultationJoinEnabled(): boolean {
  return process.env.VIDEO_CONSULTATION_JOIN_ENABLED === 'true';
}

export function v1ConsentTopologySupported(input: {
  identities: string[];
  operatorIdentity: string;
  patientIdentity: string | null;
  synthetic: boolean;
}): boolean {
  const unique = new Set(input.identities);
  if (unique.size !== 2 || !unique.has(input.operatorIdentity)) return false;
  if (input.synthetic) return true;
  return Boolean(input.patientIdentity && unique.has(input.patientIdentity));
}

export function v1CumulativeConsentLimitSatisfied(
  grantedIdentities: Iterable<string>,
  requestedIdentities: Iterable<string>,
): boolean {
  const cumulative = new Set(grantedIdentities);
  for (const identity of requestedIdentities) cumulative.add(identity);
  return cumulative.size <= 2;
}

/**
 * Allows a tightly bounded, de-identified personal E2E in staging without
 * claiming that the production-only Hosted dispatch absence and Cloud token
 * revocation probes have passed. Both variables are required so copying one
 * feature flag into production cannot silently activate the exception.
 */
export function deidentifiedE2eModeEnabled(): boolean {
  return process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER === 'STAGING'
    && process.env.VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED === 'true';
}

export interface SyntheticE2eConsultationAuthority {
  room_name: string;
  status: string;
  case_id: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_email: string | null;
  metadata: unknown;
}

export function syntheticDeidentifiedE2eConsultationApproved(
  consultation: SyntheticE2eConsultationAuthority,
  nowMs = Date.now(),
): boolean {
  if (!['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status)
    || !/^medora-deidentified-e2e-[0-9a-f]{16}$/.test(consultation.room_name)
    || consultation.case_id !== null
    || consultation.patient_id !== null
    || consultation.patient_name !== null
    || consultation.patient_email !== null
    || typeof consultation.metadata !== 'object'
    || consultation.metadata === null
    || Array.isArray(consultation.metadata)) return false;
  const metadata = consultation.metadata as Record<string, unknown>;
  if (metadata.synthetic !== true
    || metadata.classification !== 'DEIDENTIFIED_EVALUATION'
    || typeof metadata.expiresAt !== 'string') return false;
  const expiresAtMs = Date.parse(metadata.expiresAt);
  return Number.isFinite(expiresAtMs)
    && expiresAtMs > nowMs
    && expiresAtMs <= nowMs + MAX_DEIDENTIFIED_E2E_AUTHORITY_LIFETIME_SECONDS * 1_000;
}

export function approvedProviderProfile(): 'DISABLED' | 'INTEGRATED_REALTIME' {
  return process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED === 'true'
    && process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE === 'INTEGRATED_REALTIME'
    ? 'INTEGRATED_REALTIME'
    : 'DISABLED';
}

export function approvedRuntimeProfile(): 'DISABLED' | 'HOSTED_AGENT_V1' | 'SELF_HOSTED_AGENT' {
  const requested = process.env.VIDEO_INTERPRETATION_RUNTIME_PROFILE ?? 'HOSTED_AGENT_V1';
  if (requested === 'HOSTED_AGENT_V1') return 'HOSTED_AGENT_V1';
  if (requested !== 'SELF_HOSTED_AGENT') return 'DISABLED';
  return VIDEO_INTERPRETATION_SELF_HOSTED_RUNTIME_IMPLEMENTED
    && process.env.VIDEO_INTERPRETATION_SELF_HOST_APPROVED === 'true'
    && liveKitMediaPlaneRevocationApproved(process.env.LIVEKIT_URL)
    ? 'SELF_HOSTED_AGENT'
    : 'DISABLED';
}

/**
 * Both central-agent profiles keep LiveKit Cloud as the media plane. Cloud
 * token revocation is the server-enforced boundary that makes a fenced old
 * execution unable to rejoin with a cached or server-refreshed JWT.
 */
export function liveKitMediaPlaneRevocationApproved(livekitUrl: string | undefined): boolean {
  if (process.env.VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED !== 'true') return false;
  try {
    const url = new URL(livekitUrl ?? '');
    return url.protocol === 'wss:' && url.hostname.endsWith('.livekit.cloud');
  } catch {
    return false;
  }
}

export function selfHostedJoinTokenTtlSeconds(leaseExpiresAt: string, nowMs = Date.now()): number {
  const remainingMs = new Date(leaseExpiresAt).getTime() - nowMs;
  const seconds = Math.floor(remainingMs / 1_000);
  if (!Number.isFinite(remainingMs) || seconds < 1) throw new Error('self_host_lease_expired_before_token_issue');
  return Math.min(seconds, SELF_HOST_LEASE_SECONDS);
}

export function reserveInterpretationBudgetMicrodollars(
  maximumAiDurationSeconds: number,
  providerRateMicrodollarsPerMinute: number,
  providerSessionCap = MAX_PROVIDER_SESSIONS_PER_ROOM,
): number {
  if (!Number.isInteger(maximumAiDurationSeconds) || maximumAiDurationSeconds <= 0
    || !Number.isInteger(providerRateMicrodollarsPerMinute) || providerRateMicrodollarsPerMinute <= 0
    || !Number.isInteger(providerSessionCap) || providerSessionCap <= 0) {
    throw new Error('invalid video interpretation budget input');
  }
  return Math.ceil(
    maximumAiDurationSeconds / 60
      * providerRateMicrodollarsPerMinute
      * providerSessionCap
      * VIDEO_INTERPRETATION_BUDGET_SAFETY_BASIS_POINTS / 10_000,
  );
}

export function integratedTranslationTargetApproved(model: string, endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    return model === 'gpt-realtime-translate'
      && parsed.protocol === 'wss:'
      && parsed.hostname === 'api.openai.com'
      && parsed.port === ''
      && parsed.pathname === '/v1/realtime/translations'
      && parsed.search === ''
      && parsed.hash === '';
  } catch {
    return false;
  }
}

export function readHostedAgentConfig(): {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  deploymentName: string;
  bootstrapSecret: string;
} {
  const config = {
    livekitUrl: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
    deploymentName: process.env.LIVEKIT_INTERPRETATION_AGENT_NAME,
    bootstrapSecret: process.env.LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET,
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`video_interpretation_not_configured:${missing.join(',')}`);
  }
  if (config.bootstrapSecret!.length < 32) {
    throw new Error('video_interpretation_bootstrap_secret_too_short');
  }
  return config as {
    livekitUrl: string;
    apiKey: string;
    apiSecret: string;
    deploymentName: string;
    bootstrapSecret: string;
  };
}

export function readLiveKitConfig(): { livekitUrl: string; apiKey: string; apiSecret: string } {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) throw new Error('livekit_not_configured');
  return { livekitUrl, apiKey, apiSecret };
}
