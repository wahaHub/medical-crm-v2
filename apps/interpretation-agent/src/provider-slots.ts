export interface SpeechStart {
  trackId: string;
  observedAtMonotonicMs: number;
}

export class ProviderSlots {
  readonly #limit: number;
  #active = new Set<string>();
  #waiting: SpeechStart[] = [];

  constructor(limit = 2) {
    this.#limit = limit;
  }

  request(start: SpeechStart): 'ACTIVE' | 'WAITING' {
    if (this.#active.has(start.trackId)) return 'ACTIVE';
    if (this.#active.size < this.#limit) {
      this.#active.add(start.trackId);
      return 'ACTIVE';
    }
    if (!this.#waiting.some((candidate) => candidate.trackId === start.trackId)) {
      this.#waiting.push(start);
      this.#waiting.sort((a, b) => a.observedAtMonotonicMs - b.observedAtMonotonicMs
        || a.trackId.localeCompare(b.trackId));
    }
    return 'WAITING';
  }

  release(trackId: string): string | null {
    this.#active.delete(trackId);
    const next = this.#waiting.shift();
    if (!next) return null;
    this.#active.add(next.trackId);
    return next.trackId;
  }

  abandon(trackId: string): void {
    this.#waiting = this.#waiting.filter((candidate) => candidate.trackId !== trackId);
  }

  isActive(trackId: string): boolean {
    return this.#active.has(trackId);
  }
}
