export class ProviderSlots {
  readonly #limit: number;
  #active = new Set<string>();

  constructor(limit = 2) {
    this.#limit = limit;
  }

  tryAcquire(trackId: string): 'ACTIVE' | 'CAPACITY_UNAVAILABLE' {
    if (this.#active.has(trackId)) return 'ACTIVE';
    if (this.#active.size < this.#limit) {
      this.#active.add(trackId);
      return 'ACTIVE';
    }
    return 'CAPACITY_UNAVAILABLE';
  }

  release(trackId: string): void {
    this.#active.delete(trackId);
  }

  isActive(trackId: string): boolean {
    return this.#active.has(trackId);
  }
}
