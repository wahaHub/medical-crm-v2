import type { VAD } from '@livekit/agents';
import { inference } from '@livekit/agents';
import {
  RemoteAudioTrack,
  RoomEvent,
  TrackKind,
  TrackSource,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room,
} from '@livekit/rtc-node';
import type { AuthorizationWatchdog } from './authorization-watchdog.js';
import type { ControlPlaneClient } from './control-plane-client.js';
import { LiveKitOutputPublisher } from './livekit-output-publisher.js';
import { ProviderSlots } from './provider-slots.js';
import type { AuthorizedTrack, DispatchMetadata } from './runtime-types.js';
import { SpeakerRuntime } from './speaker-runtime.js';

export interface LiveKitMediaAdapterOptions {
  room: Room;
  execution: DispatchMetadata;
  vad: VAD;
  watchdog: AuthorizationWatchdog;
  client: ControlPlaneClient;
  applicationDeadlineAt: string;
  providerModel: string;
  providerEndpoint: string;
}

export function playoutAuthorityChanged(
  previousTracks: AuthorizedTrack[],
  nextTracks: AuthorizedTrack[],
): boolean {
  const nextBySid = new Map(nextTracks.map((track) => [track.trackSid, track]));
  return previousTracks.some((previous) => {
    const next = nextBySid.get(previous.trackSid);
    return !next || next.authorizationRevision !== previous.authorizationRevision
      || next.languageVersion !== previous.languageVersion
      || next.consentVersion !== previous.consentVersion;
  });
}

export class LiveKitMediaAdapter {
  readonly #options: LiveKitMediaAdapterOptions;
  readonly #output: LiveKitOutputPublisher;
  readonly #providerSlots = new ProviderSlots(2);
  readonly #authorizedBySid = new Map<string, AuthorizedTrack>();
  readonly #runtimes = new Map<string, SpeakerRuntime>();
  #closed = false;

  constructor(options: LiveKitMediaAdapterOptions) {
    this.#options = options;
    this.#output = new LiveKitOutputPublisher(options.room, options.execution);
    options.room.on(RoomEvent.TrackSubscribed, this.#onTrackSubscribed);
    options.room.on(RoomEvent.TrackUnsubscribed, this.#onTrackUnsubscribed);
  }

  reconcile(tracks: AuthorizedTrack[]): void {
    if (this.#closed) return;
    const nextBySid = new Map(
      tracks.filter((track) => track.authorized).map((track) => [track.trackSid, track]),
    );
    // Operational logging carries no content: identities, SIDs, and revisions only.
    const previousKey = [...this.#authorizedBySid.values()]
      .map((track) => `${track.trackSid}@${track.authorizationRevision}`).join(',');
    const nextKey = [...nextBySid.values()]
      .map((track) => `${track.trackSid}@${track.authorizationRevision}`).join(',');
    if (previousKey !== nextKey) {
      console.error(`[media] authorized tracks: [${nextKey || 'none'}]`);
    }
    const authorityInvalidated = playoutAuthorityChanged(
      [...this.#authorizedBySid.values()],
      [...nextBySid.values()],
    );
    if (authorityInvalidated) this.#output.invalidateAuthorization();
    for (const [sid, runtime] of this.#runtimes) {
      const authorized = nextBySid.get(sid);
      if (!authorized) {
        void runtime.close();
        this.#runtimes.delete(sid);
      } else {
        runtime.updateAuthorization(authorized);
      }
    }
    this.#authorizedBySid.clear();
    for (const [sid, track] of nextBySid) this.#authorizedBySid.set(sid, track);

    for (const participant of this.#options.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const sid = publication.sid;
        const authorized = sid ? nextBySid.get(sid) : undefined;
        const exact = authorized
          && authorized.participantIdentity === participant.identity
          && publication.kind === TrackKind.KIND_AUDIO
          && publication.source === TrackSource.SOURCE_MICROPHONE;
        publication.setSubscribed(Boolean(exact));
        if (exact && publication.track instanceof RemoteAudioTrack) {
          this.#ensureRuntime(publication.track, publication, participant);
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#options.room.off(RoomEvent.TrackSubscribed, this.#onTrackSubscribed);
    this.#options.room.off(RoomEvent.TrackUnsubscribed, this.#onTrackUnsubscribed);
    for (const participant of this.#options.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) publication.setSubscribed(false);
    }
    await Promise.all([...this.#runtimes.values()].map((runtime) => runtime.close()));
    this.#runtimes.clear();
    this.#authorizedBySid.clear();
    await this.#output.close();
  }

  readonly #onTrackSubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void => {
    if (track instanceof RemoteAudioTrack) this.#ensureRuntime(track, publication, participant);
  };

  readonly #onTrackUnsubscribed = (
    _track: RemoteTrack,
    publication: RemoteTrackPublication,
  ): void => {
    const sid = publication.sid;
    if (!sid) return;
    const runtime = this.#runtimes.get(sid);
    if (runtime) void runtime.close();
    this.#runtimes.delete(sid);
  };

  #ensureRuntime(
    remoteTrack: RemoteAudioTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    const sid = publication.sid;
    if (!sid || this.#runtimes.has(sid)) return;
    const authorization = this.#authorizedBySid.get(sid);
    if (!authorization || authorization.participantIdentity !== participant.identity
      || publication.kind !== TrackKind.KIND_AUDIO
      || publication.source !== TrackSource.SOURCE_MICROPHONE) {
      publication.setSubscribed(false);
      return;
    }
    const runtime = new SpeakerRuntime({
      execution: this.#options.execution,
      authorization,
      remoteTrack,
      vad: this.#options.vad,
      turnDetector: new inference.TurnDetector({
        unlikelyThreshold: { zh: 0.5, en: 0.5 },
      }),
      watchdog: this.#options.watchdog,
      client: this.#options.client,
      output: this.#output,
      applicationDeadlineAt: this.#options.applicationDeadlineAt,
      providerModel: this.#options.providerModel,
      providerEndpoint: this.#options.providerEndpoint,
      acquireProviderSlot: (trackId, _observedAtMonotonicMs) => {
        const result = this.#providerSlots.tryAcquire(trackId);
        if (result === 'ACTIVE') return true;
        void this.#output.publishCapacityUnavailable(trackId).catch(() => undefined);
        return false;
      },
      releaseProviderSlot: (trackId) => {
        this.#providerSlots.release(trackId);
      },
    });
    this.#runtimes.set(sid, runtime);
    console.error(`[media] speaker runtime created: sid=${sid} participant=${participant.identity} ${authorization.sourceLanguage}->${authorization.targetLanguage}`);
    runtime.run();
  }
}
