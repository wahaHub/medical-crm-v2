import type { AuthorizationResponse, DispatchMetadata } from './runtime-types.js';
import type { WatchdogRequest } from './authorization-watchdog.js';

export interface BootstrapResponse {
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
    providerModel: string;
    providerEndpoint: string;
    agentIdentity: string;
    applicationDeadlineAt: string;
  };
  watchdog: {
    intervalMs: number;
    maxRttMs: number;
    authorizationTtlMs: number;
  };
}

export class BootstrapNotReadyError extends Error {
  constructor() {
    super('bootstrap_not_ready');
    this.name = 'BootstrapNotReadyError';
  }
}

interface ProviderSessionResponse {
  success: true;
  providerSession: { id: string; state: string };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export class ControlPlaneClient {
  readonly #baseUrl: string;
  readonly #bootstrapSecret: string | null;
  #capability: string | null = null;

  constructor(options?: { baseUrl?: string; capability?: string }) {
    this.#baseUrl = (options?.baseUrl ?? requireEnv('CRM_API_URL')).replace(/\/$/, '');
    this.#bootstrapSecret = options?.capability
      ? null
      : requireEnv('LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET');
    this.#capability = options?.capability ?? null;
  }

  async bootstrap(
    execution: DispatchMetadata,
    dispatchId: string,
    timeoutMs = 10_000,
  ): Promise<BootstrapResponse> {
    if (!this.#bootstrapSecret) throw new Error('hosted bootstrap secret is unavailable');
    if (!execution.dispatchCorrelationId) throw new Error('hosted dispatch correlation is unavailable');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(`${this.#baseUrl}/api/v2/internal/video-interpretation/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bootstrapSecret: this.#bootstrapSecret,
          ...execution,
          dispatchId,
        }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({ error: 'invalid_response' })) as BootstrapResponse & { error?: string };
      if (response.status === 425 && result.error === 'bootstrap_not_ready') {
        throw new BootstrapNotReadyError();
      }
      if (!response.ok || !result.success) throw new Error(result.error ?? `bootstrap_failed:${response.status}`);
      this.#capability = result.capability;
      return result;
    } finally {
      clearTimeout(timeout);
    }
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

  async openProviderSession(
    jobId: string,
    sourceTrackId: string,
    applicationDeadlineAt: string,
  ): Promise<{ id: string; state: string }> {
    const result = await this.#authorizedJson<ProviderSessionResponse>(
      `/api/v2/internal/video-interpretation/jobs/${jobId}/provider-sessions`,
      {
        sourceTrackId,
        provider: 'openai',
        providerProfile: 'INTEGRATED_REALTIME',
        applicationDeadlineAt,
      },
    );
    return result.providerSession;
  }

  async activateProviderSession(
    jobId: string,
    sessionId: string,
    providerSessionReference: string,
  ): Promise<void> {
    await this.#authorizedJson(
      `/api/v2/internal/video-interpretation/jobs/${jobId}/provider-sessions/${sessionId}/activate`,
      { providerSessionReference },
    );
  }

  async closeProviderSession(
    jobId: string,
    sessionId: string,
    providerCloseReference: string | null,
    closeResult?: string,
  ): Promise<void> {
    await this.#authorizedJson(
      `/api/v2/internal/video-interpretation/jobs/${jobId}/provider-sessions/${sessionId}/close`,
      { state: 'CLOSING', closeResult },
    );
    await this.#authorizedJson(
      `/api/v2/internal/video-interpretation/jobs/${jobId}/provider-sessions/${sessionId}/close`,
      providerCloseReference
        ? { state: 'CLOSED', providerCloseReference }
        : { state: 'ORPHAN_WAIT', closeResult: closeResult ?? 'provider_close_unconfirmed' },
    );
  }

  async #authorizedJson<T extends { success: true }>(path: string, body: unknown): Promise<T> {
    if (!this.#capability) throw new Error('job capability is unavailable');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`${this.#baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#capability}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({ error: 'invalid_response' })) as T & { error?: string };
      if (!response.ok || !result.success) throw new Error(result.error ?? `control_plane_failed:${response.status}`);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
