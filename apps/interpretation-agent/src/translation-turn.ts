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
  gracePeriodMs?: number;
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
  readonly #gracePeriodMs: number;
  readonly #maxAudioDurationMs: number;
  readonly #maxAudioBytes: number;
  readonly #now: () => number;
  readonly #wait: (delayMs: number) => Promise<void>;
  #sourceText = '';
  #translatedText = '';
  #audio: Uint8Array[] = [];
  #audioBytes = 0;
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
    this.#gracePeriodMs = options.gracePeriodMs ?? 700;
    this.#maxAudioDurationMs = options.maxAudioDurationMs ?? 30_000;
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
    this.#transport.on('outputAudioDelta', (_event, pcm16) => {
      if (this.#discardReason) return;
      const nextBytes = this.#audioBytes + pcm16.byteLength;
      const nextDurationMs = nextBytes / (24_000 * 2) * 1_000;
      if (nextBytes > this.#maxAudioBytes || nextDurationMs > this.#maxAudioDurationMs) {
        this.discard('BUFFER_LIMIT');
        return;
      }
      this.#audioBytes = nextBytes;
      this.#audio.push(pcm16);
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
    if (this.#discardReason || !this.#sourceText.trim()
      || !this.#translatedText.trim() || this.#audioBytes === 0) return null;
    const closeReference = this.#providerReference
      ?? (typeof closedEvent.event_id === 'string' ? closedEvent.event_id : null);
    if (!closeReference) {
      this.discard('PROVIDER_ERROR');
      return null;
    }
    const caption = this.#caption(true);
    this.#onCaption?.(caption);
    return { audio: this.#audio, caption, providerCloseReference: closeReference };
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
