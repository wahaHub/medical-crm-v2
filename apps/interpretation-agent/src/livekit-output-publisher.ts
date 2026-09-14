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
import type { TranslationLanguage } from './openai-realtime-translation.js';
import type { TranslationCaption } from './translation-turn.js';

export interface PublishedAudioOutput {
  source: Pick<AudioSource, 'captureFrame' | 'waitForPlayout' | 'clearQueue' | 'close'>;
  track: Pick<LocalAudioTrack, 'close'>;
  publication: Pick<LocalTrackPublication, 'sid'>;
}

export type AudioOutputFactory = (language: TranslationLanguage) => Promise<PublishedAudioOutput>;

export interface PlayoutDiagnostics {
  turnId: string;
  speechStartedAtMonotonicMs: number;
  vadSpeechEndedAtMonotonicMs: number | null;
  firstTranslatedCaptionAtMonotonicMs: number | null;
  firstProviderAudioAtMonotonicMs: number | null;
  providerCompletedAtMonotonicMs: number | null;
}

/**
 * Streaming playout session for one translation turn. Audio chunks are pushed
 * as the provider generates them and are captured immediately, so playback
 * starts with the first chunk instead of after the full generation. The
 * publisher still serializes sessions per target language; `done` never
 * rejects so callers may fire-and-forget.
 */
export interface PlayoutHandle {
  push(chunk: Uint8Array): void;
  /** No more chunks will arrive; play out what remains. */
  finish(): void;
  /** Drop buffered and pending audio without playing further. */
  abort(): void;
  readonly done: Promise<void>;
}

export class LiveKitOutputPublisher {
  readonly #room: Room;
  readonly #execution: DispatchMetadata;
  readonly #audio = new Map<TranslationLanguage, PublishedAudioOutput>();
  readonly #playout = new Map<TranslationLanguage, Promise<void>>();
  readonly #playoutNotifiers = new Set<() => void>();
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
    // Captions are the textual record of the consultation; losing one (the
    // unreliable channel drops large accumulated payloads first) leaves the
    // client stuck showing the source language as if it were the translation.
    await this.#room.localParticipant.publishData(payload, { reliable: true, topic: 'subtitle' });
  }

  async publishCapacityUnavailable(sourceTrackId: string): Promise<void> {
    await this.#publishStatus('AI_CAPACITY_UNAVAILABLE_FOR_SPEAKER', { sourceTrackId }, true);
  }

  async play(
    targetLanguage: TranslationLanguage,
    chunks: Uint8Array[],
    eligibleAtMonotonicMs: number,
    diagnostics?: PlayoutDiagnostics,
  ): Promise<void> {
    const handle = this.beginPlayout(targetLanguage, eligibleAtMonotonicMs, diagnostics);
    for (const chunk of chunks) handle.push(chunk);
    handle.finish();
    await handle.done;
  }

  beginPlayout(
    language: TranslationLanguage,
    eligibleAtMonotonicMs?: number,
    diagnostics?: PlayoutDiagnostics,
  ): PlayoutHandle {
    const generation = this.#interruptionGeneration;
    const queue: Uint8Array[] = [];
    let ended = false;
    let aborted = false;
    let firstChunkAtMonotonicMs = eligibleAtMonotonicMs;
    let wake: (() => void) | null = null;
    const notify = (): void => {
      const pending = wake;
      wake = null;
      pending?.();
    };
    const invalidated = (): boolean => this.#closed || aborted
      || generation !== this.#interruptionGeneration;
    // Waits for the next chunk; resolves null when the stream ended, was
    // aborted, or lost authority while waiting.
    const take = async (): Promise<Uint8Array | null> => {
      while (!invalidated() && queue.length === 0 && !ended) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          this.#playoutNotifiers.add(notify);
        });
        this.#playoutNotifiers.delete(notify);
      }
      if (invalidated()) return null;
      return queue.shift() ?? null;
    };
    const previous = this.#playout.get(language) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(async (): Promise<void> => {
      const first = await take();
      if (!first || invalidated()) return;
      // Do not speak a translation after its conversational context has moved
      // on. The caption remains available, but stale queued speech is dropped.
      const waitedMs = performance.now() - (firstChunkAtMonotonicMs ?? performance.now());
      if (waitedMs > 5_000) {
        console.error(`[publisher] stale playout dropped: language=${language} waitedMs=${Math.round(waitedMs)}`);
        aborted = true;
        queue.length = 0;
        return;
      }
      const audioTrackSetupStartedAt = performance.now();
      const output = await this.#ensureAudioTrack(language);
      const audioTrackReadyAt = performance.now();
      if (invalidated()) return;
      let announced = false;
      await this.#publishStatus('TRANSLATED_PLAYOUT_STARTED', { targetLanguage: language }, true)
        .then(() => { announced = true; })
        .catch(() => undefined);
      try {
        let chunk: Uint8Array | null = first;
        while (chunk !== null) {
          if (invalidated()) {
            output.source.clearQueue();
            return;
          }
          const copied = Uint8Array.from(chunk);
          const samples = new Int16Array(copied.buffer, copied.byteOffset, copied.byteLength / 2);
          await output.source.captureFrame(new AudioFrame(samples, 24_000, 1, samples.length));
          if (diagnostics) {
            const firstFrameCapturedAt = performance.now();
            console.error(`[latency] ${JSON.stringify({
              event: 'translated_audio_first_frame_captured',
              turnId: diagnostics.turnId,
              targetLanguage: language,
              observedAt: new Date().toISOString(),
              speechStartToFirstFrameMs: roundedElapsed(
                diagnostics.speechStartedAtMonotonicMs,
                firstFrameCapturedAt,
              ),
              vadEndToFirstFrameMs: roundedElapsed(
                diagnostics.vadSpeechEndedAtMonotonicMs,
                firstFrameCapturedAt,
              ),
              firstCaptionToFirstFrameMs: roundedElapsed(
                diagnostics.firstTranslatedCaptionAtMonotonicMs,
                firstFrameCapturedAt,
              ),
              firstProviderAudioToFirstFrameMs: roundedElapsed(
                diagnostics.firstProviderAudioAtMonotonicMs,
                firstFrameCapturedAt,
              ),
              providerCompleteToFirstFrameMs: roundedElapsed(
                diagnostics.providerCompletedAtMonotonicMs,
                firstFrameCapturedAt,
              ),
              playoutQueueWaitMs: Math.round(waitedMs),
              audioTrackSetupMs: Math.round(audioTrackReadyAt - audioTrackSetupStartedAt),
            })}`);
            diagnostics = undefined;
          }
          if (invalidated()) {
            // Invalidation may interleave with an asynchronous native enqueue.
            output.source.clearQueue();
            return;
          }
          chunk = await take();
        }
        if (invalidated()) {
          output.source.clearQueue();
          return;
        }
        await output.source.waitForPlayout();
      } finally {
        if (announced) {
          await this.#publishStatus('TRANSLATED_PLAYOUT_ENDED', { targetLanguage: language }, true)
            .catch(() => undefined);
        }
      }
    });
    const done = task.catch(() => undefined);
    this.#playout.set(language, done);
    return {
      push: (chunk) => {
        if (ended || invalidated()) return;
        firstChunkAtMonotonicMs ??= performance.now();
        queue.push(chunk);
        notify();
      },
      finish: () => {
        ended = true;
        notify();
      },
      abort: () => {
        aborted = true;
        queue.length = 0;
        notify();
      },
      done,
    };
  }

  invalidateAuthorization(): void {
    this.#interruptionGeneration += 1;
    for (const output of this.#audio.values()) output.source.clearQueue();
    // Wake streaming playouts waiting for chunks so they re-check authority.
    for (const notify of this.#playoutNotifiers) notify();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#interruptionGeneration += 1;
    for (const notify of this.#playoutNotifiers) notify();
    this.#playoutNotifiers.clear();
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

  async #ensureAudioTrack(language: TranslationLanguage): Promise<PublishedAudioOutput> {
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

  async #createAudioTrack(language: TranslationLanguage): Promise<PublishedAudioOutput> {
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

function roundedElapsed(fromMs: number | null, toMs: number): number | null {
  return fromMs === null ? null : Math.max(0, Math.round(toMs - fromMs));
}
