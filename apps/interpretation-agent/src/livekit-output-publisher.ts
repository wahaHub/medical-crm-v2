import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  type LocalTrackPublication,
  type Room,
} from '@livekit/rtc-node';
import type { AuthorizedTrack, DispatchMetadata } from './runtime-types.js';
import type { TranslationCaption } from './translation-turn.js';

export interface PublishedAudioOutput {
  source: Pick<AudioSource, 'captureFrame' | 'waitForPlayout' | 'clearQueue' | 'close'>;
  track: Pick<LocalAudioTrack, 'close'>;
  publication: Pick<LocalTrackPublication, 'sid'>;
}

export type AudioOutputFactory = (language: 'zh' | 'en') => Promise<PublishedAudioOutput>;

export class LiveKitOutputPublisher {
  readonly #room: Room;
  readonly #execution: DispatchMetadata;
  readonly #audio = new Map<'zh' | 'en', PublishedAudioOutput>();
  readonly #playout = new Map<'zh' | 'en', Promise<void>>();
  readonly #audioOutputFactory: AudioOutputFactory;
  #captionSequence = 0;
  #interruptionGeneration = 0;
  #closed = false;

  constructor(room: Room, execution: DispatchMetadata, audioOutputFactory?: AudioOutputFactory) {
    this.#room = room;
    this.#execution = execution;
    this.#audioOutputFactory = audioOutputFactory ?? ((language) => this.#createAudioTrack(language));
  }

  async publishCaption(track: AuthorizedTrack, caption: TranslationCaption): Promise<void> {
    if (this.#closed || !this.#room.localParticipant) return;
    const payload = new TextEncoder().encode(JSON.stringify({
      schema: 'medora.subtitle.v1',
      jobId: this.#execution.jobId,
      roomGeneration: this.#execution.roomGeneration,
      interpretationGeneration: this.#execution.interpretationGeneration,
      executionVersion: this.#execution.executionVersion,
      authorizationRevision: track.authorizationRevision,
      languageVersion: track.languageVersion,
      consentVersion: track.consentVersion,
      segmentSequence: ++this.#captionSequence,
      sourceTrackSid: track.trackSid,
      from: track.participantIdentity,
      fromLanguage: caption.sourceLanguage,
      toLanguage: caption.targetLanguage,
      sourceText: caption.sourceText.slice(0, 4_000),
      translatedText: caption.translatedText.slice(0, 4_000),
      isFinal: caption.isFinal,
    }));
    await this.#room.localParticipant.publishData(payload, { reliable: false, topic: 'subtitle' });
  }

  async publishCapacityUnavailable(sourceTrackId: string): Promise<void> {
    await this.#publishStatus('AI_CAPACITY_UNAVAILABLE_FOR_SPEAKER', { sourceTrackId }, true);
  }

  async play(
    targetLanguage: 'zh' | 'en',
    chunks: Uint8Array[],
    eligibleAtMonotonicMs: number,
  ): Promise<void> {
    const interruptionGeneration = this.#interruptionGeneration;
    const previous = this.#playout.get(targetLanguage) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      if (this.#closed || interruptionGeneration !== this.#interruptionGeneration
        || performance.now() - eligibleAtMonotonicMs > 5_000) return;
      const output = await this.#ensureAudioTrack(targetLanguage);
      if (this.#closed || interruptionGeneration !== this.#interruptionGeneration) return;
      let announced = false;
      await this.#publishStatus('TRANSLATED_PLAYOUT_STARTED', { targetLanguage }, true)
        .then(() => { announced = true; })
        .catch(() => undefined);
      try {
      for (const bytes of chunks) {
        if (this.#closed || interruptionGeneration !== this.#interruptionGeneration) return;
        const copied = Uint8Array.from(bytes);
        const samples = new Int16Array(copied.buffer, copied.byteOffset, copied.byteLength / 2);
        await output.source.captureFrame(new AudioFrame(samples, 24_000, 1, samples.length));
        if (this.#closed || interruptionGeneration !== this.#interruptionGeneration) {
          // Invalidation may interleave with an asynchronous native enqueue.
          output.source.clearQueue();
          return;
        }
      }
      await output.source.waitForPlayout();
      } finally {
        if (announced) {
          await this.#publishStatus('TRANSLATED_PLAYOUT_ENDED', { targetLanguage }, true)
            .catch(() => undefined);
        }
      }
    });
    this.#playout.set(targetLanguage, next);
    await next;
  }

  interruptHumanSpeech(): void {
    this.invalidateAuthorization();
  }

  invalidateAuthorization(): void {
    this.#interruptionGeneration += 1;
    for (const output of this.#audio.values()) output.source.clearQueue();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#interruptionGeneration += 1;
    for (const output of this.#audio.values()) {
      output.source.clearQueue();
      if (output.publication.sid) {
        await this.#room.localParticipant?.unpublishTrack(output.publication.sid, true).catch(() => undefined);
      }
      await output.source.close().catch(() => undefined);
      await output.track.close(false).catch(() => undefined);
    }
    this.#audio.clear();
  }

  async #ensureAudioTrack(language: 'zh' | 'en'): Promise<PublishedAudioOutput> {
    const existing = this.#audio.get(language);
    if (existing) return existing;
    const output = await this.#audioOutputFactory(language);
    if (this.#closed) {
      output.source.clearQueue();
      await output.source.close().catch(() => undefined);
      await output.track.close(false).catch(() => undefined);
      throw new Error('translation output is closed');
    }
    this.#audio.set(language, output);
    return output;
  }

  async #createAudioTrack(language: 'zh' | 'en'): Promise<PublishedAudioOutput> {
    const participant = this.#room.localParticipant;
    if (!participant) throw new Error('LiveKit local participant is unavailable');
    const source = new AudioSource(24_000, 1, 2_000);
    const track = LocalAudioTrack.createAudioTrack(`medora-translation-${language}`, source);
    const publication = await participant.publishTrack(
      track,
      new TrackPublishOptions({ source: TrackSource.SOURCE_UNKNOWN }),
    );
    return { source, track, publication };
  }

  async #publishStatus(
    code: string,
    details: Record<string, unknown>,
    reliable: boolean,
  ): Promise<void> {
    if (this.#closed || !this.#room.localParticipant) return;
    const payload = new TextEncoder().encode(JSON.stringify({
      schema: 'medora.interpretation.status.v1',
      jobId: this.#execution.jobId,
      roomGeneration: this.#execution.roomGeneration,
      interpretationGeneration: this.#execution.interpretationGeneration,
      executionVersion: this.#execution.executionVersion,
      code,
      ...details,
    }));
    await this.#room.localParticipant.publishData(payload, { reliable, topic: 'interpretation-status' });
  }
}
