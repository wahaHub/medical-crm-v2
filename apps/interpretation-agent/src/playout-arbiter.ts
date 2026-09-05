import type { TranslationLanguage } from './openai-realtime-translation.js';

export interface EligibleTurn<T> {
  id: string;
  targetLanguage: TranslationLanguage;
  eligibleAtMonotonicMs: number;
  payload: T;
}

export class PlayoutArbiter<T> {
  readonly #expiryMs: number;
  #queues = new Map<TranslationLanguage, EligibleTurn<T>[]>();
  #playing = new Set<TranslationLanguage>();

  constructor(expiryMs = 5_000) {
    this.#expiryMs = expiryMs;
  }

  enqueue(turn: EligibleTurn<T>): void {
    const queue = this.#queues.get(turn.targetLanguage) ?? [];
    queue.push(turn);
    queue.sort((a, b) => a.eligibleAtMonotonicMs - b.eligibleAtMonotonicMs || a.id.localeCompare(b.id));
    this.#queues.set(turn.targetLanguage, queue);
  }

  next(language: TranslationLanguage, nowMonotonicMs: number): EligibleTurn<T> | null {
    if (this.#playing.has(language)) return null;
    const queue = this.#queues.get(language) ?? [];
    while (queue[0] && nowMonotonicMs - queue[0].eligibleAtMonotonicMs > this.#expiryMs) queue.shift();
    const turn = queue.shift() ?? null;
    if (turn) this.#playing.add(language);
    return turn;
  }

  complete(language: TranslationLanguage): void {
    this.#playing.delete(language);
  }

  clear(): void {
    this.#queues.clear();
    this.#playing.clear();
  }
}
