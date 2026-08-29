import type { AuthorizationResponse, DispatchMetadata } from './runtime-types.js';
import type { WatchdogRequest } from './authorization-watchdog.js';

interface BootstrapResponse {
  success: true;
  capability: string;
  capabilityExpiresAt: string;
  job: {
    id: string;
    roomName: string;
    roomGeneration: number;
    interpretationGeneration: number;
    executionVersion: number;
    authorizationRevision: number;
    providerProfile: 'DISABLED' | 'INTEGRATED_REALTIME';
    agentIdentity: string;
  };
  watchdog: {
    intervalMs: number;
    maxRttMs: number;
    authorizationTtlMs: number;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export class ControlPlaneClient {
  readonly #baseUrl: string;
  readonly #bootstrapSecret: string;
  #capability: string | null = null;

  constructor() {
    this.#baseUrl = requireEnv('CRM_API_URL').replace(/\/$/, '');
    this.#bootstrapSecret = requireEnv('LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET');
  }

  async bootstrap(execution: DispatchMetadata, dispatchId: string): Promise<BootstrapResponse> {
    const response = await fetch(`${this.#baseUrl}/api/v2/internal/video-interpretation/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrapSecret: this.#bootstrapSecret,
        ...execution,
        dispatchId,
      }),
    });
    const result = await response.json().catch(() => ({ error: 'invalid_response' })) as BootstrapResponse & { error?: string };
    if (!response.ok || !result.success) throw new Error(result.error ?? `bootstrap_failed:${response.status}`);
    this.#capability = result.capability;
    return result;
  }

  async authorization(
    jobId: string,
    request: WatchdogRequest,
    timeoutMs: number,
  ): Promise<AuthorizationResponse> {
    if (!this.#capability) throw new Error('job capability is unavailable');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `${this.#baseUrl}/api/v2/internal/video-interpretation/jobs/${jobId}/authorization`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.#capability}`,
          },
          body: JSON.stringify({ requestSeq: request.requestSeq, nonce: request.nonce }),
          signal: controller.signal,
        },
      );
      const result = await response.json().catch(() => ({ error: 'invalid_response' })) as AuthorizationResponse & { error?: string };
      if (!response.ok || !result.success || !result.authorized) {
        throw new Error(result.error ?? `authorization_failed:${response.status}`);
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
