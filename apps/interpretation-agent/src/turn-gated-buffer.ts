export type TurnDiscardReason = 'SPEAKER_RESUMED' | 'BUFFER_LIMIT' | 'MAPPING_UNPROVED' | 'STOPPED';

export interface BufferedAudioChunk {
  responseId: string;
  itemId: string;
  sequence: number;
  durationMs: number;
  bytes: Uint8Array;
}

export class TurnGatedBuffer {
  readonly #maxDurationMs: number;
  readonly #maxBytes: number;
  readonly #gracePeriodMs: number;
  #chunks: BufferedAudioChunk[] = [];
  #durationMs = 0;
  #bytes = 0;
  #graceStartedAt: number | null = null;
  #endOfTurnAccepted = false;
  #providerFinal = false;
  #discardReason: TurnDiscardReason | null = null;
  #lastSequence = -1;
  #responseId: string | null = null;
  #itemId: string | null = null;

  constructor(maxDurationMs = 30_000, maxBytes = 8 * 1024 * 1024, gracePeriodMs = 700) {
    this.#maxDurationMs = maxDurationMs;
    this.#maxBytes = maxBytes;
    this.#gracePeriodMs = gracePeriodMs;
  }

  append(chunk: BufferedAudioChunk): boolean {
    if (this.#discardReason || this.#providerFinal) return false;
    if (this.#responseId !== null
      && (chunk.responseId !== this.#responseId || chunk.itemId !== this.#itemId)) {
      this.discard('MAPPING_UNPROVED');
      return false;
    }
    if (chunk.sequence !== this.#lastSequence + 1) {
      this.discard('MAPPING_UNPROVED');
      return false;
    }
    if (this.#durationMs + chunk.durationMs > this.#maxDurationMs
      || this.#bytes + chunk.bytes.byteLength > this.#maxBytes) {
      this.discard('BUFFER_LIMIT');
      return false;
    }
    this.#responseId = chunk.responseId;
    this.#itemId = chunk.itemId;
    this.#lastSequence = chunk.sequence;
    this.#durationMs += chunk.durationMs;
    this.#bytes += chunk.bytes.byteLength;
    this.#chunks.push(chunk);
    return true;
  }

  speechEnded(vadSpeechEndMonotonicMs: number): void {
    if (!this.#discardReason && this.#graceStartedAt === null) {
      this.#graceStartedAt = vadSpeechEndMonotonicMs;
    }
  }

  acceptEndOfTurn(): boolean {
    if (this.#discardReason) return false;
    this.#endOfTurnAccepted = true;
    return true;
  }

  markProviderFinal(responseId: string, itemId: string): boolean {
    if (this.#discardReason || this.#responseId !== responseId || this.#itemId !== itemId) {
      this.discard('MAPPING_UNPROVED');
      return false;
    }
    this.#providerFinal = true;
    return true;
  }

  speakerResumed(): void {
    this.discard('SPEAKER_RESUMED');
  }

  eligible(nowMonotonicMs: number): boolean {
    return !this.#discardReason && this.#graceStartedAt !== null
      && this.#endOfTurnAccepted && this.#providerFinal
      && nowMonotonicMs >= this.#graceStartedAt + this.#gracePeriodMs;
  }

  drain(nowMonotonicMs: number): BufferedAudioChunk[] {
    if (!this.eligible(nowMonotonicMs)) return [];
    const chunks = this.#chunks;
    this.#chunks = [];
    return chunks;
  }

  discard(reason: TurnDiscardReason): void {
    this.#discardReason ??= reason;
    this.#chunks = [];
    this.#bytes = 0;
    this.#durationMs = 0;
  }

  get discardReason(): TurnDiscardReason | null {
    return this.#discardReason;
  }
}
