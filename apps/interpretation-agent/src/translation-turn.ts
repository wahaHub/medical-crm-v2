import { EventEmitter } from 'node:events';
import type {
  TranslationDeltaEvent,
  TranslationDoneEvent,
  TranslationLanguage,
} from './openai-realtime-translation.js';

export interface TranslationTransportEvents {
  event: [event: { type: string; [key: string]: unknown }];
  inputTranscriptDelta: [event: TranslationDeltaEvent];
  outputTranscriptDelta: [event: TranslationDeltaEvent];
  /** Full accumulated transcript from completion-style provider events. */
  inputTranscript: [transcript: string];
  outputTranscript: [transcript: string];
  outputAudioDelta: [event: TranslationDeltaEvent, pcm16: Uint8Array];
  closed: [event: TranslationDoneEvent];
  sessionError: [error: Error];
}

export interface TranslationTransport extends EventEmitter<TranslationTransportEvents> {
  connect(): Promise<void>;
  appendPcm16(pcm16: Uint8Array): void;
  closeAndDrain(): Promise<TranslationDoneEvent>;
  abort(): void;
}

export interface TranslationCaption {
  sourceText: string;
  translatedText: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  isFinal: boolean;
}

export interface CompletedTranslationTurn {
  audio: Uint8Array[];
  caption: TranslationCaption;
  providerCloseReference: string;
}

export type TurnDiscardReason =
  | 'AUTHORIZATION_REVOKED'
  | 'BUFFER_LIMIT'
  | 'END_OF_TURN_REJECTED'
  | 'PROVIDER_ERROR'
  | 'SPEAKER_RESUMED';

export interface TranslationTurnOptions {
  transport: TranslationTransport;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  onCaption?: (caption: TranslationCaption) => void;
  onAudioChunk?: (pcm16: Uint8Array, observedAtMonotonicMs: number) => void;
  gracePeriodMs?: number;
  postCloseDrainMs?: number;
  maxAudioDurationMs?: number;
  maxAudioBytes?: number;
  now?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}

export class TranslationTurn {
  readonly #transport: TranslationTransport;
  readonly #sourceLanguage: TranslationLanguage;
  readonly #targetLanguage: TranslationLanguage;
  readonly #onCaption?: (caption: TranslationCaption) => void;
  readonly #onAudioChunk?: (pcm16: Uint8Array, observedAtMonotonicMs: number) => void;
  readonly #gracePeriodMs: number;
  readonly #postCloseDrainMs: number;
  readonly #maxAudioDurationMs: number;
  readonly #maxAudioBytes: number;
  readonly #now: () => number;
  readonly #wait: (delayMs: number) => Promise<void>;
  #sourceText = '';
  #translatedText = '';
  #audio: Uint8Array[] = [];
  #audioBytes = 0;
  #firstOutputAudioAtMonotonicMs: number | null = null;
  #appendedBytes = 0;
  #discardReason: TurnDiscardReason | null = null;
  #connected = false;
  #closing = false;
  #providerReference: string | null = null;
  #providerClosed = false;

  constructor(options: TranslationTurnOptions) {
    this.#transport = options.transport;
    this.#sourceLanguage = options.sourceLanguage;
    this.#targetLanguage = options.targetLanguage;
    this.#onCaption = options.onCaption;
    this.#onAudioChunk = options.onAudioChunk;
    this.#gracePeriodMs = options.gracePeriodMs ?? 700;
    this.#postCloseDrainMs = options.postCloseDrainMs ?? 800;
    // Medical explanations routinely exceed 30 seconds after translation.
    // Keep a bounded guard, but do not turn ordinary long sentences into an
    // already-audible partial response.
    this.#maxAudioDurationMs = options.maxAudioDurationMs ?? 120_000;
    this.#maxAudioBytes = options.maxAudioBytes ?? 8 * 1024 * 1024;
    this.#now = options.now ?? (() => performance.now());
    this.#wait = options.wait ?? (async (delayMs) => {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    });

    this.#transport.on('event', (event) => {
      if (event.type === 'session.updated' || event.type === 'session.created') {
        const session = event.session as { id?: unknown } | undefined;
        if (typeof session?.id === 'string') this.#providerReference = session.id;
      }
    });
    this.#transport.on('inputTranscriptDelta', (event) => {
      if (this.#discardReason) return;
      this.#sourceText += event.delta;
      this.#publishCaption(false);
    });
    this.#transport.on('outputTranscriptDelta', (event) => {
      if (this.#discardReason) return;
      this.#translatedText += event.delta;
      this.#publishCaption(false);
    });
    this.#transport.on('inputTranscript', (transcript) => {
      if (this.#discardReason) return;
      // Completion-style full text is authoritative; keep whichever is longer
      // in case deltas already accumulated a partial version.
      if (transcript.trim().length > this.#sourceText.trim().length) {
        this.#sourceText = transcript;
        this.#publishCaption(false);
      }
    });
    this.#transport.on('outputTranscript', (transcript) => {
      if (this.#discardReason) return;
      if (transcript.trim().length > this.#translatedText.trim().length) {
        this.#translatedText = transcript;
        this.#publishCaption(false);
      }
    });
    this.#transport.on('outputAudioDelta', (_event, pcm16) => {
      if (this.#discardReason) return;
      const nextBytes = this.#audioBytes + pcm16.byteLength;
      const nextDurationMs = nextBytes / (24_000 * 2) * 1_000;
      if (nextBytes > this.#maxAudioBytes || nextDurationMs > this.#maxAudioDurationMs) {
        this.discard('BUFFER_LIMIT');
        return;
      }
      const observedAtMonotonicMs = this.#now();
      this.#firstOutputAudioAtMonotonicMs ??= observedAtMonotonicMs;
      this.#audioBytes = nextBytes;
      this.#audio.push(pcm16);
      this.#onAudioChunk?.(pcm16, observedAtMonotonicMs);
    });
    this.#transport.on('sessionError', () => this.discard('PROVIDER_ERROR'));
  }

  async connect(): Promise<void> {
    await this.#transport.connect();
    this.#connected = true;
  }

  appendPcm16(pcm16: Uint8Array, authorized: boolean): boolean {
    if (!authorized) {
      this.discard('AUTHORIZATION_REVOKED');
      return false;
    }
    if (!this.#connected || this.#closing || this.#discardReason) return false;
    this.#transport.appendPcm16(pcm16);
    this.#appendedBytes += pcm16.byteLength;
    return true;
  }

  async finish(
    vadSpeechEndMonotonicMs: number,
    endOfTurnAccepted: Promise<boolean>,
  ): Promise<CompletedTranslationTurn | null> {
    if (!this.#connected || this.#closing || this.#discardReason) return null;
    this.#closing = true;
    const grace = this.#wait(Math.max(0, vadSpeechEndMonotonicMs + this.#gracePeriodMs - this.#now()));
    let closedEvent: TranslationDoneEvent;
    let accepted: boolean;
    try {
      [closedEvent, accepted] = await Promise.all([
        this.#transport.closeAndDrain(),
        endOfTurnAccepted,
        grace,
      ]).then(([closed, eot]) => [closed, eot]);
      this.#providerClosed = true;
    } catch {
      this.discard('PROVIDER_ERROR');
      return null;
    }
    if (!accepted) {
      this.discard('END_OF_TURN_REJECTED');
      return null;
    }
    // The provider flushes transcript deltas lazily — input transcripts in
    // particular keep arriving after session.closed (observed in production
    // logs). Drain briefly so the final caption and the guard below see the
    // complete turn instead of racing the last deltas.
    await this.#wait(this.#postCloseDrainMs);
    if (this.#discardReason) return null;
    // Require output, not input: what the listener needs is the translation.
    // The source transcript is best-effort and often arrives too late to gate
    // on; gating on it silently dropped fully-generated translations.
    if (!this.#translatedText.trim() && this.#audioBytes === 0) {
      console.error(`[turn] finish-guard-fail: discardReason=${this.#discardReason} srcChars=${this.#sourceText.trim().length} tgtChars=${this.#translatedText.trim().length} audioBytes=${this.#audioBytes} appendedBytes=${this.#appendedBytes}`);
      return null;
    }
    const closeReference = this.#providerReference
      ?? (typeof closedEvent.event_id === 'string' ? closedEvent.event_id : null);
    if (!closeReference) {
      this.discard('PROVIDER_ERROR');
      return null;
    }
    if (this.#sourceText.trim() || this.#translatedText.trim()) {
      this.#onCaption?.(this.#caption(true));
    }
    return { audio: this.#audio, caption: this.#caption(true), providerCloseReference: closeReference };
  }

  speakerResumed(): void {
    this.discard('SPEAKER_RESUMED');
  }

  discard(reason: TurnDiscardReason): void {
    if (this.#discardReason) return;
    this.#discardReason = reason;
    this.#audio = [];
    this.#audioBytes = 0;
    this.#transport.abort();
  }

  get discardReason(): TurnDiscardReason | null {
    return this.#discardReason;
  }

  get appendedBytes(): number {
    return this.#appendedBytes;
  }

  get sourceTextLength(): number {
    return this.#sourceText.trim().length;
  }

  get translatedTextLength(): number {
    return this.#translatedText.trim().length;
  }

  get capturedAudioBytes(): number {
    return this.#audioBytes;
  }

  get firstOutputAudioAtMonotonicMs(): number | null {
    return this.#firstOutputAudioAtMonotonicMs;
  }

  get providerSessionReference(): string | null {
    return this.#providerReference;
  }

  get confirmedCloseReference(): string | null {
    return this.#providerClosed ? this.#providerReference : null;
  }

  #publishCaption(isFinal: boolean): void {
    this.#onCaption?.(this.#caption(isFinal));
  }

  #caption(isFinal: boolean): TranslationCaption {
    return {
      sourceText: this.#sourceText,
      translatedText: this.#translatedText,
      sourceLanguage: this.#sourceLanguage,
      targetLanguage: this.#targetLanguage,
      isFinal,
    };
  }
}
