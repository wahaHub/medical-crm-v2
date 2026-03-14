import { describe, it, expect } from 'vitest';
import { paginate } from '../pagination';

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('returns first page', () => {
    const result = paginate(items, 1, 10);
    expect(result.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  it('returns last page', () => {
    const result = paginate(items, 3, 10);
    expect(result.data).toEqual([21, 22, 23, 24, 25]);
    expect(result.hasMore).toBe(false);
  });

  it('returns empty for out-of-range page', () => {
    const result = paginate(items, 99, 10);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});
