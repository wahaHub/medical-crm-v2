import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const INTERPRETATION_POLICY_VERSION = 'video-ai-consent-v1';
export const MAX_ACTIVE_AI_ROOMS = 2;
export const MAX_PROVIDER_SESSIONS_PER_ROOM = 2;
// Server-owned fallback for the pinned /v1/realtime/translations profile:
// two hours maximum lifetime plus five minutes for skew/drain. The production
// media gate must remain false until the exact endpoint/model contract and an
// executable probe prove that this bound cannot be extended by the provider.
export const OPENAI_TRANSLATION_CONSERVATIVE_EXPIRY_SECONDS = (2 * 60 + 5) * 60;
export const WATCHDOG_INTERVAL_MS = 500;
export const WATCHDOG_MAX_RTT_MS = 400;
export const WATCHDOG_AUTHORIZATION_TTL_MS = 1_500;

// This is deliberately a code gate, not an environment switch. The current
// hosted agent now contains the media/provider path, but the de-identified
// OpenAI probe and an end-to-end LiveKit room have not passed from this
// environment. Enabling patient audio still requires a reviewed code change
// after those executable gates and the privacy/contract gates pass.
export const VIDEO_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED = false;

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

export function approvedProviderProfile(): 'DISABLED' | 'INTEGRATED_REALTIME' {
  return process.env.VIDEO_INTERPRETATION_PROVIDER_APPROVED === 'true'
    && process.env.VIDEO_INTERPRETATION_PROVIDER_PROFILE === 'INTEGRATED_REALTIME'
    ? 'INTEGRATED_REALTIME'
    : 'DISABLED';
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
