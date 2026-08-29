import { randomBytes } from 'node:crypto';
import type { AuthorizationResponse, AuthorizedTrack, DispatchMetadata } from './runtime-types.js';

export interface WatchdogRequest {
  requestSeq: number;
  nonce: string;
  startedMonotonicMs: number;
}

export class AuthorizationWatchdog {
  readonly #execution: DispatchMetadata;
  readonly #maxRttMs: number;
  readonly #ttlMs: number;
  #nextSeq = 1;
  #lastAcceptedSeq = 0;
  #highestRevision = 0;
  #deadlineMonotonicMs = Number.NEGATIVE_INFINITY;
  #tracks = new Map<string, AuthorizedTrack>();
  #inFlight: WatchdogRequest | null = null;

  constructor(execution: DispatchMetadata, maxRttMs = 400, ttlMs = 1_500) {
    this.#execution = execution;
    this.#maxRttMs = maxRttMs;
    this.#ttlMs = ttlMs;
  }

  begin(nowMonotonicMs: number): WatchdogRequest | null {
    if (this.#inFlight) return null;
    this.#inFlight = {
      requestSeq: this.#nextSeq++,
      nonce: randomBytes(18).toString('base64url'),
      startedMonotonicMs: nowMonotonicMs,
    };
    return this.#inFlight;
  }

  reject(request: WatchdogRequest): void {
    if (this.#inFlight?.requestSeq === request.requestSeq) this.#inFlight = null;
  }

  accept(
    request: WatchdogRequest,
    response: AuthorizationResponse,
    receivedMonotonicMs: number,
  ): boolean {
    if (this.#inFlight?.requestSeq !== request.requestSeq) return false;
    this.#inFlight = null;
    const rtt = receivedMonotonicMs - request.startedMonotonicMs;
    if (rtt < 0 || rtt > this.#maxRttMs) return false;
    if (response.requestSeq !== request.requestSeq || response.nonce !== request.nonce) return false;
    if (response.requestSeq <= this.#lastAcceptedSeq) return false;
    if (response.jobId !== this.#execution.jobId
      || response.roomName !== this.#execution.roomName
      || response.roomGeneration !== this.#execution.roomGeneration
      || response.interpretationGeneration !== this.#execution.interpretationGeneration
      || response.executionVersion !== this.#execution.executionVersion) return false;
    if (response.authorizationRevision < this.#highestRevision) return false;

    const nextTracks = new Map<string, AuthorizedTrack>();
    for (const track of response.tracks) {
      const previous = this.#tracks.get(track.id);
      if (previous && (track.languageVersion < previous.languageVersion
        || track.consentVersion < previous.consentVersion
        || track.authorizationRevision < previous.authorizationRevision)) return false;
      if (track.authorizationRevision !== response.authorizationRevision) return false;
      nextTracks.set(track.id, track);
    }

    this.#lastAcceptedSeq = response.requestSeq;
    this.#highestRevision = response.authorizationRevision;
    this.#deadlineMonotonicMs = request.startedMonotonicMs + this.#ttlMs;
    this.#tracks = nextTracks;
    return true;
  }

  canForward(trackId: string, nowMonotonicMs: number): boolean {
    return nowMonotonicMs <= this.#deadlineMonotonicMs
      && this.#tracks.get(trackId)?.authorized === true;
  }

  expire(): void {
    this.#deadlineMonotonicMs = Number.NEGATIVE_INFINITY;
    this.#tracks.clear();
  }

  get authorizationDeadlineMonotonicMs(): number {
    return this.#deadlineMonotonicMs;
  }

  get authorizedTracks(): AuthorizedTrack[] {
    return [...this.#tracks.values()].filter((track) => track.authorized);
  }
}
