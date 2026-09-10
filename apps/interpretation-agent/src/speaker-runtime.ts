import type { VAD } from '@livekit/agents';
import { asLanguageCode, VADEventType, type inference } from '@livekit/agents';
import { AudioStream, type AudioFrame, type RemoteAudioTrack } from '@livekit/rtc-node';
import type { AuthorizationWatchdog } from './authorization-watchdog.js';
import type { ControlPlaneClient } from './control-plane-client.js';
import type {
  LiveKitOutputPublisher,
  PlayoutDiagnostics,
  PlayoutHandle,
} from './livekit-output-publisher.js';
import {
  RealtimeTranslationSession,
  safetyIdentifierForJob,
} from './openai-realtime-translation.js';
import type { AuthorizedTrack, DispatchMetadata } from './runtime-types.js';
import { SpeakerTurnBoundary } from './speaker-turn-boundary.js';
import { TranslationTurn } from './translation-turn.js';

interface ActiveTurn {
  turn: TranslationTurn;
  providerSessionId: string;
  connected: boolean;
  finishing: boolean;
  /** Set while a mid-sentence pause is being given extra time to continue. */
  extensionTimer: ReturnType<typeof setTimeout> | null;
  /** Set while an end-of-turn prediction await is in flight for this turn. */
  deciding: boolean;
  diagnostics: {
    turnId: string;
    speechStartedAtMonotonicMs: number;
    vadSpeechEndedAtMonotonicMs: number | null;
    firstTranslatedCaptionAtMonotonicMs: number | null;
    firstProviderAudioAtMonotonicMs: number | null;
    providerCompletedAtMonotonicMs: number | null;
  };
  playout: {
    handle: PlayoutHandle | null;
    bufferedChunks: Uint8Array[];
    bufferedBytes: number;
  };
}

export interface SpeakerRuntimeOptions {
  execution: DispatchMetadata;
  authorization: AuthorizedTrack;
  remoteTrack: RemoteAudioTrack;
  vad: VAD;
  turnDetector: inference.TurnDetector;
  watchdog: AuthorizationWatchdog;
  client: ControlPlaneClient;
  output: LiveKitOutputPublisher;
  applicationDeadlineAt: string;
  providerModel: string;
  providerEndpoint: string;
  acquireProviderSlot: (trackId: string, observedAtMonotonicMs: number) => boolean;
  releaseProviderSlot: (trackId: string) => void;
}

export function runtimeAuthorityOpen(
  authorized: boolean,
  watchdogAllows: boolean,
  applicationDeadlineMs: number,
  nowMs = Date.now(),
): boolean {
  return authorized && watchdogAllows && Number.isFinite(applicationDeadlineMs)
    && nowMs < applicationDeadlineMs;
}

/**
 * How long a turn stays open when the VAD sees a pause but the end-of-turn
 * model considers the sentence unfinished. Bounds the extra latency added to
 * short utterances the model misjudges.
 */
const TURN_EXTENSION_MS = 2_000;
const STREAMING_PLAYOUT_LOOKAHEAD_MS = 1_500;
const STREAMING_PLAYOUT_LOOKAHEAD_BYTES = 24_000 * 2 * STREAMING_PLAYOUT_LOOKAHEAD_MS / 1_000;

export class SpeakerRuntime {
  readonly #options: SpeakerRuntimeOptions;
  readonly #audioStream: AudioStream;
  readonly #vadStream: ReturnType<VAD['stream']>;
  readonly #turnDetectorStream: ReturnType<inference.TurnDetector['stream']>;
  #authorization: AuthorizedTrack;
  #active: ActiveTurn | null = null;
  #pendingPcm: Uint8Array[] = [];
  #pendingBytes = 0;
  #preRoll: Uint8Array[] = [];
  #preRollBytes = 0;
  #closed = false;
  #runPromise: Promise<void> | null = null;
  #pendingSpeechEndAt: number | null = null;
  #starting = false;
  #pendingOverflow = false;
  #inSpeech = false;
  // Utterance that overlaps the previous turn's generation/playout. It is
  // buffered here and kicked off as the next turn when the previous turn
  // releases, instead of being dropped.
  #queuedSpeechStart = false;
  #queuedSpeechEndAt: number | null = null;
  #queuedPcm: Uint8Array[] = [];
  #queuedBytes = 0;
  #queuedOverflow = false;
  readonly #turnBoundary = new SpeakerTurnBoundary();
  readonly #tasks = new Set<Promise<void>>();
  readonly #applicationDeadlineMs: number;
  #deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  #deadlineExpired = false;
  #turnSequence = 0;

  constructor(options: SpeakerRuntimeOptions) {
    this.#options = options;
    this.#applicationDeadlineMs = new Date(options.applicationDeadlineAt).getTime();
    if (!Number.isFinite(this.#applicationDeadlineMs)) {
      throw new Error('invalid application deadline');
    }
    this.#authorization = options.authorization;
    this.#audioStream = new AudioStream(options.remoteTrack, {
      sampleRate: 24_000,
      numChannels: 1,
      frameSizeMs: 20,
    });
    this.#vadStream = options.vad.stream();
    this.#turnDetectorStream = options.turnDetector.stream();
  }

  run(): void {
    if (this.#runPromise) return;
    const deadlineDelayMs = Math.max(0, this.#applicationDeadlineMs - Date.now());
    this.#deadlineTimer = setTimeout(() => {
      this.#trackTask(this.#expireAtApplicationDeadline());
    }, deadlineDelayMs);
    this.#runPromise = Promise.all([this.#pumpAudio(), this.#observeVad()])
      .then(() => undefined)
      .catch(async () => {
        if (this.#active) await this.#discardActive('PROVIDER_ERROR');
      });
  }

  updateAuthorization(track: AuthorizedTrack): void {
    const changed = track.languageVersion !== this.#authorization.languageVersion
      || track.consentVersion !== this.#authorization.consentVersion
      || track.authorizationRevision !== this.#authorization.authorizationRevision;
    this.#authorization = track;
    if (changed) {
      if (this.#active || this.#starting || !track.authorized) {
        this.#beginDropUntilSpeechEnd();
      }
      if (this.#active) this.#trackTask(this.#discardActive('AUTHORIZATION_REVOKED'));
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#deadlineTimer) clearTimeout(this.#deadlineTimer);
    this.#deadlineTimer = null;
    if (this.#active) await this.#discardActive('AUTHORIZATION_REVOKED');
    this.#vadStream.endInput();
    this.#turnDetectorStream.endInput();
    await this.#audioStream.cancel().catch(() => undefined);
    this.#vadStream.close();
    await this.#turnDetectorStream.aclose().catch(() => undefined);
    await this.#runPromise?.catch(() => undefined);
    await Promise.allSettled([...this.#tasks]);
  }

  async #pumpAudio(): Promise<void> {
    let frames = 0;
    let loggedAt = 0;
    let windowPeak = 0;
    let windowSumSquares = 0;
    let windowSamples = 0;
    try {
      for await (const frame of this.#audioStream) {
        if (this.#closed) break;
        if (Date.now() >= this.#applicationDeadlineMs) {
          await this.#expireAtApplicationDeadline();
          continue;
        }
        frames += 1;
        for (const sample of frame.data) {
          const v = Math.abs(sample);
          if (v > windowPeak) windowPeak = v;
          windowSumSquares += sample * sample;
        }
        windowSamples += frame.data.length;
        if (frames - loggedAt >= 250) {
          loggedAt = frames;
          const rms = windowSamples > 0 ? Math.round(Math.sqrt(windowSumSquares / windowSamples)) : 0;
          console.error(`[runtime] audio flowing: sid=${this.#authorization.trackSid} frames=${frames} peak=${windowPeak} rms=${rms}`);
          windowPeak = 0;
          windowSumSquares = 0;
          windowSamples = 0;
        }
        this.#vadStream.pushFrame(frame);
        this.#turnDetectorStream.pushAudio(frame);
        const pcm = pcm16Bytes(frame);
        const active = this.#active;
        if (!active) {
          if (!this.#turnBoundary.acceptsPcm()) continue;
          if (this.#starting) this.#pushPending(pcm);
          else this.#pushPreRoll(pcm);
          continue;
        }
        if (active.finishing) {
          // The previous turn is generating/playing its translation. Buffer
          // overlapping speech for the next turn instead of dropping it.
          this.#pushQueued(pcm);
          continue;
        }
        if (!this.#authorizedNow()) {
          await this.#discardActive('AUTHORIZATION_REVOKED');
          continue;
        }
        if (active.connected) active.turn.appendPcm16(pcm, true);
        else this.#pushPending(pcm);
      }
    } finally {
      this.#vadStream.endInput();
      this.#turnDetectorStream.endInput();
    }
  }

  async #observeVad(): Promise<void> {
    for await (const event of this.#vadStream) {
      if (this.#closed) return;
      if (event.type === VADEventType.START_OF_SPEECH) {
        console.error(`[runtime] vad speech start: sid=${this.#authorization.trackSid}`);
        this.#inSpeech = true;
        // No hard barge-in here: interrupting the playing translation on every
        // speech start silently discarded spoken content (the tail of the
        // sentence being played, or a whole turn queued behind it). Overlap is
        // handled by the listeners' clients ducking original audio instead.
        this.#trackTask(this.#onSpeechStart(performance.now()));
      } else if (event.type === VADEventType.END_OF_SPEECH) {
        console.error(`[runtime] vad speech end: sid=${this.#authorization.trackSid}`);
        this.#inSpeech = false;
        this.#trackTask(this.#onSpeechEnd(performance.now()));
      }
    }
  }

  async #onSpeechStart(observedAtMonotonicMs: number): Promise<void> {
    const activeTurn = this.#active;
    if (activeTurn?.finishing) {
      // Speech overlapping the previous turn's translation: mark it queued so
      // its frames (already buffering in #pumpAudio) become the next turn.
      this.#queuedSpeechStart = true;
      return;
    }
    if (activeTurn && activeTurn.extensionTimer) {
      // The speaker resumed inside the extension window: the pause was
      // mid-sentence, so this audio continues the same translation turn.
      clearTimeout(activeTurn.extensionTimer);
      activeTurn.extensionTimer = null;
      console.error(`[runtime] turn extension resumed: sid=${this.#authorization.trackSid}`);
      return;
    }
    if (activeTurn?.deciding) {
      // The speaker resumed while an end-of-turn prediction was in flight:
      // keep the turn open. The in-flight check re-verifies #inSpeech before
      // extending or finishing.
      return;
    }
    const boundaryDecision = this.#turnBoundary.onSpeechStart(Boolean(this.#active));
    if (boundaryDecision === 'DROP') return;
    if (boundaryDecision === 'DISCARD_ACTIVE') {
      // A resumed utterance belongs to the discarded turn. Mark it before
      // awaiting provider/control-plane cleanup so no tail frames can roll
      // into the next turn's pre-roll.
      this.#clearTurnInputBuffers();
      await this.#discardActive('SPEAKER_RESUMED');
      return;
    }
    if (this.#starting) return;
    if (!this.#authorizedNow()) return;
    if (!this.#options.acquireProviderSlot(this.#authorization.id, observedAtMonotonicMs)) {
      console.error(`[runtime] provider slot unavailable: track=${this.#authorization.id}`);
      this.#beginDropUntilSpeechEnd();
      return;
    }
    this.#starting = true;
    console.error(`[runtime] speech start: sid=${this.#authorization.trackSid} ${this.#authorization.sourceLanguage}->${this.#authorization.targetLanguage}`);
    this.#pendingPcm = this.#preRoll.splice(0);
    this.#pendingBytes = this.#preRollBytes;
    this.#preRollBytes = 0;
    this.#pendingOverflow = false;
    try {
      // Validate all local prerequisites before creating the durable provider
      // fence; a synchronous constructor failure must not strand CREATING.
      const openAiKey = requireOpenAiKey();
      assertApprovedProviderTarget(this.#options.providerModel, this.#options.providerEndpoint);
      const providerSession = await this.#options.client.openProviderSession(
        this.#options.execution.jobId,
        this.#authorization.id,
        this.#options.applicationDeadlineAt,
      );
      if (!this.#authorizedNow()) {
        await this.#options.client.closeProviderSession(
          this.#options.execution.jobId,
          providerSession.id,
          null,
          'turn_aborted:AUTHORIZATION_REVOKED',
        ).catch(() => undefined);
        this.#options.releaseProviderSlot(this.#authorization.id);
        return;
      }
      const transport = new RealtimeTranslationSession({
        apiKey: openAiKey,
        targetLanguage: this.#authorization.targetLanguage,
        safetyIdentifier: safetyIdentifierForJob(this.#options.execution.jobId),
        model: this.#options.providerModel,
        endpoint: this.#options.providerEndpoint,
      });
      const diagnostics: PlayoutDiagnostics = {
        turnId: `${this.#authorization.trackSid}:${++this.#turnSequence}`,
        speechStartedAtMonotonicMs: observedAtMonotonicMs,
        vadSpeechEndedAtMonotonicMs: null,
        firstTranslatedCaptionAtMonotonicMs: null as number | null,
        firstProviderAudioAtMonotonicMs: null,
        providerCompletedAtMonotonicMs: null,
      };
      const playout = {
        handle: null as PlayoutHandle | null,
        bufferedChunks: [] as Uint8Array[],
        bufferedBytes: 0,
      };
      const turn = new TranslationTurn({
        transport,
        sourceLanguage: this.#authorization.sourceLanguage,
        targetLanguage: this.#authorization.targetLanguage,
        onCaption: (caption) => {
          if (!this.#authorizedNow()) return;
          if (caption.translatedText.trim()
            && diagnostics.firstTranslatedCaptionAtMonotonicMs === null) {
            diagnostics.firstTranslatedCaptionAtMonotonicMs = performance.now();
          }
          void this.#options.output.publishCaption(this.#authorization, caption).catch(() => undefined);
        },
        onAudioChunk: (chunk, audioObservedAtMonotonicMs) => {
          diagnostics.firstProviderAudioAtMonotonicMs ??= audioObservedAtMonotonicMs;
          if (playout.handle) {
            playout.handle.push(chunk);
            return;
          }
          playout.bufferedChunks.push(chunk);
          playout.bufferedBytes += chunk.byteLength;
          if (playout.bufferedBytes < STREAMING_PLAYOUT_LOOKAHEAD_BYTES) return;

          playout.handle = this.#options.output.beginPlayout(
            this.#authorization.targetLanguage,
            performance.now(),
            diagnostics,
          );
          for (const buffered of playout.bufferedChunks) playout.handle.push(buffered);
          playout.bufferedChunks = [];
          playout.bufferedBytes = 0;
        },
      });
      this.#active = {
        turn,
        providerSessionId: providerSession.id,
        connected: false,
        finishing: false,
        extensionTimer: null,
        deciding: false,
        diagnostics,
        playout,
      };
      await turn.connect();
      if (this.#closed || this.#active?.turn !== turn || !this.#authorizedNow()) {
        await this.#discardActive('AUTHORIZATION_REVOKED');
        return;
      }
      const providerReference = turn.providerSessionReference;
      if (!providerReference) throw new Error('OpenAI session reference unavailable');
      await this.#options.client.activateProviderSession(
        this.#options.execution.jobId,
        providerSession.id,
        providerReference,
      );
      const active = this.#active;
      if (!active || active.turn !== turn) return;
      if (this.#pendingOverflow) {
        await this.#discardActive('BUFFER_LIMIT');
        return;
      }
      active.connected = true;
      for (const pcm of this.#pendingPcm) {
        if (!this.#authorizedNow() || !turn.appendPcm16(pcm, true)) break;
      }
      this.#pendingPcm = [];
      this.#pendingBytes = 0;
      const pendingSpeechEndAt = this.#pendingSpeechEndAt;
      this.#pendingSpeechEndAt = null;
      if (pendingSpeechEndAt !== null) this.#trackTask(this.#onSpeechEnd(pendingSpeechEndAt));
    } catch (error) {
      console.error(`[runtime] provider turn failed: track=${this.#authorization.id} ${error instanceof Error ? error.message : String(error)}`);
      if (this.#active) await this.#discardActive('PROVIDER_ERROR');
      else {
        this.#pendingPcm = [];
        this.#pendingBytes = 0;
        this.#pendingOverflow = false;
        this.#options.releaseProviderSlot(this.#authorization.id);
      }
    } finally {
      this.#starting = false;
    }
  }

  async #onSpeechEnd(vadSpeechEndMonotonicMs: number): Promise<void> {
    if (this.#turnBoundary.onSpeechEnd() === 'DROPPED_END') {
      this.#clearTurnInputBuffers();
      return;
    }
    const active = this.#active;
    if (!active) {
      if (this.#starting) this.#pendingSpeechEndAt = vadSpeechEndMonotonicMs;
      return;
    }
    if (active.finishing) {
      // The queued utterance ended while the previous turn was still
      // generating/playing; remember the boundary for the kick-off.
      if (this.#queuedSpeechStart) this.#queuedSpeechEndAt = vadSpeechEndMonotonicMs;
      return;
    }
    if (!active.connected) {
      this.#pendingSpeechEndAt = vadSpeechEndMonotonicMs;
      return;
    }
    // Semantic sentence-boundary gate: a VAD pause alone does not end the
    // turn. When the end-of-turn model says the utterance is likely
    // unfinished, keep the provider session open and give the speaker extra
    // time; a resume inside the window continues the same turn. This stops
    // sentences from being split at every thinking pause.
    if (!active.extensionTimer && !this.#inSpeech) {
      // Two VAD ends (or an extension expiry) can race into the decision; only
      // one may run, otherwise finish() would be entered twice.
      if (active.deciding) return;
      active.deciding = true;
      try {
        const eot = await this.#eotProbability();
        if (eot && eot.probability < eot.threshold) {
          if (this.#inSpeech) return; // resumed during the check; turn continues
          console.error(`[runtime] turn extended (incomplete sentence): sid=${this.#authorization.trackSid} probability=${eot.probability} threshold=${eot.threshold}`);
          active.extensionTimer = setTimeout(() => {
            this.#trackTask(this.#onExtensionExpired(active, vadSpeechEndMonotonicMs));
          }, TURN_EXTENSION_MS);
          return;
        }
      } finally {
        active.deciding = false;
      }
      if (this.#inSpeech) return; // resumed during the check; the next speech-end re-decides
    }
    await this.#finishActive(active, vadSpeechEndMonotonicMs);
  }

  async #onExtensionExpired(active: ActiveTurn, vadSpeechEndMonotonicMs: number): Promise<void> {
    if (this.#closed || this.#active?.turn !== active.turn) return;
    if (active.finishing || active.deciding) return;
    if (active.extensionTimer) {
      clearTimeout(active.extensionTimer);
      active.extensionTimer = null;
    }
    if (this.#inSpeech) return; // speaker resumed; the next speech-end re-decides
    console.error(`[runtime] turn extension expired: sid=${this.#authorization.trackSid}`);
    await this.#finishActive(active, vadSpeechEndMonotonicMs);
  }

  async #finishActive(active: ActiveTurn, vadSpeechEndMonotonicMs: number): Promise<void> {
    if (active.finishing) return; // a raced decision already owns this turn
    if (active.extensionTimer) {
      clearTimeout(active.extensionTimer);
      active.extensionTimer = null;
    }
    active.finishing = true;
    active.diagnostics.vadSpeechEndedAtMonotonicMs = vadSpeechEndMonotonicMs;
    let playoutReleased = false;
    try {
      const completed = await active.turn.finish(vadSpeechEndMonotonicMs, Promise.resolve(true));
      const providerCompletedAtMonotonicMs = performance.now();
      active.diagnostics.providerCompletedAtMonotonicMs = providerCompletedAtMonotonicMs;
      if (this.#active?.turn !== active.turn) return;
      const providerReference = completed?.providerCloseReference ?? active.turn.confirmedCloseReference;
      if (completed && this.#authorizedNow()) {
        console.error(`[runtime] turn completed: sid=${this.#authorization.trackSid} audioBytes=${completed.audio.reduce((n, b) => n + b.byteLength, 0)}`);
        // Release only a fully drained provider turn. This intentionally trades
        // some first-audio latency for the guarantee that provider failure or a
        // safety limit can never leave the listener with half a sentence.
        active.diagnostics.firstProviderAudioAtMonotonicMs
          ??= active.turn.firstOutputAudioAtMonotonicMs;
        if (active.playout.handle) {
          active.playout.handle.finish();
        } else {
          void this.#options.output.play(
            this.#authorization.targetLanguage,
            completed.audio,
            providerCompletedAtMonotonicMs,
            active.diagnostics,
          );
        }
        playoutReleased = true;
      } else if (!completed) {
        active.playout.handle?.abort();
        console.error(`[runtime] turn incomplete: sid=${this.#authorization.trackSid} reason=${active.turn.discardReason ?? 'unknown'} appendedBytes=${active.turn.appendedBytes} srcChars=${active.turn.sourceTextLength} tgtChars=${active.turn.translatedTextLength} outAudioBytes=${active.turn.capturedAudioBytes}`);
      }
      // Fully generated audio is already independently queued before CRM
      // finality is reported, so a reporting failure cannot cut it short.
      await this.#options.client.closeProviderSession(
        this.#options.execution.jobId,
        active.providerSessionId,
        providerReference,
        completed ? 'session_closed' : `turn_discarded:${active.turn.discardReason ?? 'incomplete'}`,
      );
    } finally {
      if (!playoutReleased) active.playout.handle?.abort();
      if (this.#active?.turn === active.turn) {
        // Release the turn and the provider slot as soon as generation settles;
        // playout continues in the publisher's per-language queue. A queued
        // overlapping utterance becomes the next turn right away.
        this.#active = null;
        this.#options.releaseProviderSlot(this.#authorization.id);
        this.#kickQueuedTurn();
      }
    }
  }

  /**
   * Ask the audio end-of-turn model whether the utterance is complete.
   * Returns null when the detector is unavailable/failing — callers must then
   * fall back to finishing the turn immediately (VAD-only behavior).
   */
  async #eotProbability(): Promise<{ probability: number; threshold: number } | null> {
    try {
      const threshold = await this.#turnDetectorStream.unlikelyThreshold(
        asLanguageCode(this.#authorization.sourceLanguage),
      ) ?? 0.5;
      const prediction = await this.#turnDetectorStream.predict().await;
      return { probability: prediction.endOfTurnProbability, threshold };
    } catch {
      return null;
    }
  }

  async #discardActive(reason: Parameters<TranslationTurn['discard']>[0]): Promise<void> {
    const active = this.#active;
    if (!active) return;
    if (active.extensionTimer) {
      clearTimeout(active.extensionTimer);
      active.extensionTimer = null;
    }
    active.turn.discard(reason);
    active.playout.handle?.abort();
    this.#active = null;
    this.#pendingSpeechEndAt = null;
    this.#pendingPcm = [];
    this.#pendingBytes = 0;
    this.#pendingOverflow = false;
    this.#clearQueuedSpeech();
    try {
      // discard() already terminated the provider websocket via transport.abort().
      // OpenAI realtime sessions are connection-bound, so a terminated socket ends
      // the provider session; the session id captured from session.created is valid
      // closure evidence. Reporting CLOSED (instead of ORPHAN_WAIT) avoids the 2h05m
      // conservative fence that would otherwise block job finalization
      // (INTERPRETATION_CLEANUP_PENDING on the next start) and consume a per-room
      // provider slot. Falls back to ORPHAN_WAIT when the session never connected
      // (no provider reference captured).
      await this.#options.client.closeProviderSession(
        this.#options.execution.jobId,
        active.providerSessionId,
        active.turn.providerSessionReference,
        `turn_aborted:${reason}`,
      );
    } catch {
      // The control plane keeps the fence occupied when provider closure is not proved.
    } finally {
      this.#options.releaseProviderSlot(this.#authorization.id);
    }
  }

  #authorizedNow(): boolean {
    return runtimeAuthorityOpen(
      this.#authorization.authorized,
      this.#options.watchdog.canForward(this.#authorization.id, performance.now()),
      this.#applicationDeadlineMs,
    );
  }

  async #expireAtApplicationDeadline(): Promise<void> {
    if (this.#deadlineExpired || this.#closed) return;
    this.#deadlineExpired = true;
    this.#options.output.invalidateAuthorization();
    this.#beginDropUntilSpeechEnd();
    if (this.#active) await this.#discardActive('AUTHORIZATION_REVOKED');
  }

  #pushPending(pcm: Uint8Array): void {
    // Sized for the cross-region control plane: opening a provider turn costs
    // an openProviderSession round trip plus the OpenAI websocket handshake
    // plus activation (~3s total from us-west-2), so the previous 2s budget
    // overflowed on every cold turn and the turn was discarded as
    // BUFFER_LIMIT. 512 KiB covers ~10.6s of 24kHz PCM16.
    const maxBytes = 512 * 1024;
    if (this.#pendingBytes + pcm.byteLength > maxBytes) {
      this.#pendingOverflow = true;
      return;
    }
    this.#pendingBytes += pcm.byteLength;
    this.#pendingPcm.push(pcm);
  }

  #pushPreRoll(pcm: Uint8Array): void {
    this.#preRoll.push(pcm);
    this.#preRollBytes += pcm.byteLength;
    const maxBytes = 24_000 * 2 * 2;
    while (this.#preRollBytes > maxBytes && this.#preRoll[0]) {
      this.#preRollBytes -= this.#preRoll.shift()!.byteLength;
    }
  }

  #pushQueued(pcm: Uint8Array): void {
    // Hold a full long-form medical utterance while the prior turn finishes.
    // At 24kHz PCM16, this is 30 seconds / ~1.37 MiB per active speaker.
    const maxBytes = 24_000 * 2 * 30;
    if (this.#queuedBytes + pcm.byteLength > maxBytes) {
      if (!this.#queuedOverflow) {
        console.error(`[runtime] queued utterance truncated (buffer limit): sid=${this.#authorization.trackSid}`);
      }
      this.#queuedOverflow = true;
      return;
    }
    this.#queuedBytes += pcm.byteLength;
    this.#queuedPcm.push(pcm);
  }

  /**
   * Starts the buffered overlapping utterance as the next turn. Called after
   * the previous turn released its provider slot. Buffered frames become the
   * pre-roll so the beginning of the utterance survives.
   */
  #kickQueuedTurn(): void {
    const start = this.#queuedSpeechStart;
    const endAt = this.#queuedSpeechEndAt;
    const buffered = this.#queuedPcm;
    const bufferedBytes = this.#queuedBytes;
    const overflow = this.#queuedOverflow;
    this.#clearQueuedSpeech();
    if (!start) return;
    if (overflow) {
      // Never send a known-truncated utterance to the translator. If speech is
      // still in progress, keep dropping through its matching VAD end.
      if (endAt === null) this.#beginDropUntilSpeechEnd();
      return;
    }
    this.#preRoll = buffered;
    this.#preRollBytes = bufferedBytes;
    if (this.#closed) {
      this.#preRoll = [];
      this.#preRollBytes = 0;
      return;
    }
    console.error(`[runtime] starting queued utterance as next turn: sid=${this.#authorization.trackSid} bufferedBytes=${bufferedBytes}`);
    if (endAt !== null) this.#pendingSpeechEndAt = endAt;
    this.#trackTask(this.#onSpeechStart(performance.now()));
  }

  #clearQueuedSpeech(): void {
    this.#queuedSpeechStart = false;
    this.#queuedSpeechEndAt = null;
    this.#queuedPcm = [];
    this.#queuedBytes = 0;
    this.#queuedOverflow = false;
  }

  #beginDropUntilSpeechEnd(): void {
    this.#turnBoundary.discardUntilSpeechEnd();
    this.#clearTurnInputBuffers();
  }

  #clearTurnInputBuffers(): void {
    this.#preRoll = [];
    this.#preRollBytes = 0;
    this.#pendingPcm = [];
    this.#pendingBytes = 0;
    this.#pendingSpeechEndAt = null;
    this.#pendingOverflow = false;
    this.#clearQueuedSpeech();
  }

  #trackTask(task: Promise<void>): void {
    // Background VAD callbacks must never surface as unhandled rejections. Their
    // own cleanup paths already fail closed; retain the guarded task so close()
    // can still wait for every callback to settle.
    const guarded = task.catch(() => undefined);
    this.#tasks.add(guarded);
    void guarded.then(() => this.#tasks.delete(guarded));
  }
}

function assertApprovedProviderTarget(model: string, endpoint: string): void {
  const parsed = new URL(endpoint);
  if (model !== 'gpt-realtime-translate'
    || parsed.protocol !== 'wss:'
    || parsed.hostname !== 'api.openai.com'
    || parsed.port !== ''
    || parsed.pathname !== '/v1/realtime/translations'
    || parsed.search !== ''
    || parsed.hash !== '') {
    throw new Error('provider target is not approved by this interpretation build');
  }
}

function pcm16Bytes(frame: AudioFrame): Uint8Array {
  return Uint8Array.from(new Uint8Array(
    frame.data.buffer,
    frame.data.byteOffset,
    frame.data.byteLength,
  ));
}

function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is required');
  return key;
}
