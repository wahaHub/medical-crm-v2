import { describe, expect, it } from 'vitest';
import { runtimeAuthorityOpen } from '../speaker-runtime.js';

describe('speaker runtime absolute authority deadline', () => {
  it('closes authority exactly at the application deadline even with a fresh watchdog lease', () => {
    expect(runtimeAuthorityOpen(true, true, 10_000, 9_999)).toBe(true);
    expect(runtimeAuthorityOpen(true, true, 10_000, 10_000)).toBe(false);
    expect(runtimeAuthorityOpen(true, true, 10_000, 10_001)).toBe(false);
  });

  it('also requires current consent and watchdog authority', () => {
    expect(runtimeAuthorityOpen(false, true, 10_000, 1)).toBe(false);
    expect(runtimeAuthorityOpen(true, false, 10_000, 1)).toBe(false);
    expect(runtimeAuthorityOpen(true, true, Number.NaN, 1)).toBe(false);
  });
});
