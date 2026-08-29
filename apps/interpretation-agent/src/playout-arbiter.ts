export interface EligibleTurn<T> {
  id: string;
  targetLanguage: 'zh' | 'en';
  eligibleAtMonotonicMs: number;
  payload: T;
}

export class PlayoutArbiter<T> {
  readonly #expiryMs: number;
  #queues = new Map<'zh' | 'en', EligibleTurn<T>[]>();
  #playing = new Set<'zh' | 'en'>();

  constructor(expiryMs = 5_000) {
    this.#expiryMs = expiryMs;
  }

  enqueue(turn: EligibleTurn<T>): void {
    const queue = this.#queues.get(turn.targetLanguage) ?? [];
    queue.push(turn);
    queue.sort((a, b) => a.eligibleAtMonotonicMs - b.eligibleAtMonotonicMs || a.id.localeCompare(b.id));
    this.#queues.set(turn.targetLanguage, queue);
  }

  next(language: 'zh' | 'en', nowMonotonicMs: number): EligibleTurn<T> | null {
    if (this.#playing.has(language)) return null;
    const queue = this.#queues.get(language) ?? [];
    while (queue[0] && nowMonotonicMs - queue[0].eligibleAtMonotonicMs > this.#expiryMs) queue.shift();
    const turn = queue.shift() ?? null;
    if (turn) this.#playing.add(language);
    return turn;
  }

  complete(language: 'zh' | 'en'): void {
    this.#playing.delete(language);
  }

  clear(): void {
    this.#queues.clear();
    this.#playing.clear();
  }
}
