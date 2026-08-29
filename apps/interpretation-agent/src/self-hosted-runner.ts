import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as silero from '@livekit/agents-plugin-silero';
import { Room, RoomEvent } from '@livekit/rtc-node';
import { AuthorizationWatchdog } from './authorization-watchdog.js';
import { ControlPlaneClient } from './control-plane-client.js';
import { LiveKitMediaAdapter } from './livekit-media-adapter.js';
import type { DispatchMetadata } from './runtime-types.js';

interface SelfHostedClaim {
  success: true;
  capability?: string;
  livekitUrl?: string;
  livekitToken?: string;
  retryAfterSeconds?: number;
  job: null | {
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
    leaseVersion: number;
  };
  watchdog?: { intervalMs: number; maxRttMs: number; authorizationTtlMs: number };
  heartbeat?: { intervalSeconds: number; leaseSeconds: number };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireCredential(name: string, fileName: string): string {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  const path = process.env[fileName];
  if (!path) throw new Error(`${name} or ${fileName} is required`);
  const value = readFileSync(path, 'utf8').trim();
  if (!value) throw new Error(`${fileName} is empty`);
  return value;
}

class SelfHostClient {
  readonly #baseUrl = requireEnv('CRM_API_URL').replace(/\/$/, '');
  readonly #hostId = requireEnv('MEDORA_SELF_HOST_ID');
  readonly #hostBearer = requireCredential('MEDORA_SELF_HOST_BEARER', 'MEDORA_SELF_HOST_BEARER_FILE');

  get baseUrl(): string { return this.#baseUrl; }

  async claim(): Promise<SelfHostedClaim> {
    return await this.#request(`/api/v2/internal/video-interpretation/self-hosts/${this.#hostId}/claim`, {});
  }

  async heartbeat(job: NonNullable<SelfHostedClaim['job']>): Promise<void> {
    await this.#request(`/api/v2/internal/video-interpretation/self-hosts/${this.#hostId}/heartbeat`, {
      jobId: job.id,
      executionVersion: job.executionVersion,
      leaseVersion: job.leaseVersion,
    });
  }

  async #request<T extends { success: true }>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`${this.#baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#hostBearer}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({ error: 'invalid_response' })) as T & { error?: string };
      if (!response.ok || !result.success) throw new Error(result.error ?? `self_host_control_failed:${response.status}`);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function runClaim(host: SelfHostClient, claim: SelfHostedClaim, signal: AbortSignal): Promise<void> {
  if (!claim.job || !claim.capability || !claim.livekitUrl || !claim.livekitToken
    || !claim.watchdog || !claim.heartbeat) throw new Error('incomplete self-host claim');
  if (claim.job.providerProfile !== 'INTEGRATED_REALTIME') throw new Error('provider profile rejected');
  process.env.OPENAI_API_KEY = requireCredential('OPENAI_API_KEY', 'OPENAI_API_KEY_FILE');
  const execution: DispatchMetadata = {
    schema: 'medora.interpretation.dispatch.v1',
    jobId: claim.job.id,
    roomName: claim.job.roomName,
    roomGeneration: claim.job.roomGeneration,
    interpretationGeneration: claim.job.interpretationGeneration,
    executionVersion: claim.job.executionVersion,
    agentIdentity: claim.job.agentIdentity,
  };
  const vad = await silero.VAD.load({ minSilenceDuration: 550, maxBufferedSpeech: 30_000 });
  const room = new Room();
  const client = new ControlPlaneClient({ baseUrl: host.baseUrl, capability: claim.capability });
  const watchdog = new AuthorizationWatchdog(
    execution,
    claim.watchdog.maxRttMs,
    claim.watchdog.authorizationTtlMs,
  );
  await room.connect(claim.livekitUrl, claim.livekitToken, { autoSubscribe: false, dynacast: true });
  const media = new LiveKitMediaAdapter({
    room,
    execution,
    vad,
    watchdog,
    client,
    applicationDeadlineAt: claim.job.applicationDeadlineAt,
    providerModel: claim.job.providerModel,
    providerEndpoint: claim.job.providerEndpoint,
  });
  let stopped = false;
  let refreshInFlight: Promise<void> | null = null;
  const stop = async (waitForRefresh = true) => {
    if (stopped) return;
    stopped = true;
    watchdog.expire();
    media.reconcile([]);
    if (waitForRefresh) await refreshInFlight?.catch(() => undefined);
    await media.close();
    await room.disconnect().catch(() => undefined);
  };
  const refresh = async () => {
    if (stopped) return;
    const request = watchdog.begin(performance.now());
    if (!request) return;
    try {
      const response = await client.authorization(execution.jobId, request, claim.watchdog!.maxRttMs);
      if (!stopped && watchdog.accept(request, response, performance.now())) {
        media.reconcile(watchdog.authorizedTracks);
      }
    } catch {
      watchdog.reject(request);
    }
    if (performance.now() > watchdog.authorizationDeadlineMonotonicMs) await stop(false);
  };
  const refreshTimer = setInterval(() => {
    if (refreshInFlight) return;
    const pending = refresh().finally(() => {
      if (refreshInFlight === pending) refreshInFlight = null;
    });
    refreshInFlight = pending;
  }, claim.watchdog.intervalMs);
  const heartbeatTimer = setInterval(() => {
    void host.heartbeat(claim.job!).catch(() => { void stop(); });
  }, claim.heartbeat.intervalSeconds * 1_000);
  await refresh();
  await new Promise<void>((resolve) => {
    const onAbort = () => { void stop().finally(resolve); };
    if (stopped || !room.isConnected || signal.aborted) onAbort();
    else {
      signal.addEventListener('abort', onAbort, { once: true });
      room.once(RoomEvent.Disconnected, () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      });
    }
  });
  clearInterval(refreshTimer);
  clearInterval(heartbeatTimer);
  await stop();
}

export async function runSelfHostedSupervisor(): Promise<void> {
  const host = new SelfHostClient();
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  while (!abort.signal.aborted) {
    try {
      const claim = await host.claim();
      if (claim.job) await runClaim(host, claim, abort.signal);
      else await new Promise((resolve) => setTimeout(resolve, (claim.retryAfterSeconds ?? 10) * 1_000));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runSelfHostedSupervisor();
}
