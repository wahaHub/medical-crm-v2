import type { VAD } from '@livekit/agents';
import { asLanguageCode, VADEventType, type inference } from '@livekit/agents';
import { AudioStream, type AudioFrame, type RemoteAudioTrack } from '@livekit/rtc-node';
import type { AuthorizationWatchdog } from './authorization-watchdog.js';
import type { ControlPlaneClient } from './control-plane-client.js';
import type { LiveKitOutputPublisher } from './livekit-output-publisher.js';
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
  readonly #turnBoundary = new SpeakerTurnBoundary();
  readonly #tasks = new Set<Promise<void>>();
  readonly #applicationDeadlineMs: number;
  #deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  #deadlineExpired = false;

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
    try {
      for await (const frame of this.#audioStream) {
        if (this.#closed) break;
        if (Date.now() >= this.#applicationDeadlineMs) {
          await this.#expireAtApplicationDeadline();
          continue;
        }
        frames += 1;
        if (frames - loggedAt >= 250) {
          loggedAt = frames;
          let peak = 0;
          for (const sample of frame.data) {
            const v = Math.abs(sample);
            if (v > peak) peak = v;
          }
          console.error(`[runtime] audio flowing: sid=${this.#authorization.trackSid} frames=${frames} peak=${peak}`);
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
        if (active.finishing) continue;
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
        this.#options.output.interruptHumanSpeech();
        this.#trackTask(this.#onSpeechStart(performance.now()));
      } else if (event.type === VADEventType.END_OF_SPEECH) {
        console.error(`[runtime] vad speech end: sid=${this.#authorization.trackSid}`);
        this.#trackTask(this.#onSpeechEnd(performance.now()));
      }
    }
  }

  async #onSpeechStart(observedAtMonotonicMs: number): Promise<void> {
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
      const turn = new TranslationTurn({
        transport,
        sourceLanguage: this.#authorization.sourceLanguage,
        targetLanguage: this.#authorization.targetLanguage,
        onCaption: (caption) => {
          if (!this.#authorizedNow()) return;
          void this.#options.output.publishCaption(this.#authorization, caption).catch(() => undefined);
        },
      });
      this.#active = {
        turn,
        providerSessionId: providerSession.id,
        connected: false,
        finishing: false,
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
    if (active.finishing) return;
    if (!active.connected) {
      this.#pendingSpeechEndAt = vadSpeechEndMonotonicMs;
      return;
    }
    active.finishing = true;
    const accepted = this.#predictEndOfTurn();
    const completed = await active.turn.finish(vadSpeechEndMonotonicMs, accepted);
    if (this.#active?.turn !== active.turn) return;
    const providerReference = completed?.providerCloseReference ?? active.turn.confirmedCloseReference;
    try {
      await this.#options.client.closeProviderSession(
        this.#options.execution.jobId,
        active.providerSessionId,
        providerReference,
        completed ? 'session_closed' : `turn_discarded:${active.turn.discardReason ?? 'incomplete'}`,
      );
      if (completed && this.#authorizedNow()) {
        console.error(`[runtime] turn completed: sid=${this.#authorization.trackSid} audioBytes=${completed.audio.reduce((n, b) => n + b.byteLength, 0)}`);
        await this.#options.output.play(
          this.#authorization.targetLanguage,
          completed.audio,
          performance.now(),
        );
      } else if (!completed) {
        console.error(`[runtime] turn incomplete: sid=${this.#authorization.trackSid} reason=${active.turn.discardReason ?? 'unknown'}`);
      }
    } finally {
      this.#active = null;
      this.#options.releaseProviderSlot(this.#authorization.id);
    }
  }

  async #predictEndOfTurn(): Promise<boolean> {
    try {
      const threshold = await this.#turnDetectorStream.unlikelyThreshold(
        asLanguageCode(this.#authorization.sourceLanguage),
      ) ?? 0.5;
      const prediction = await this.#turnDetectorStream.predict().await;
      return prediction.endOfTurnProbability >= threshold;
    } catch {
      return false;
    }
  }

  async #discardActive(reason: Parameters<TranslationTurn['discard']>[0]): Promise<void> {
    const active = this.#active;
    if (!active) return;
    active.turn.discard(reason);
    this.#active = null;
    this.#pendingSpeechEndAt = null;
    this.#pendingPcm = [];
    this.#pendingBytes = 0;
    this.#pendingOverflow = false;
    try {
      await this.#options.client.closeProviderSession(
        this.#options.execution.jobId,
        active.providerSessionId,
        null,
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
