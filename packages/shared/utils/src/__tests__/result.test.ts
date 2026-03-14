import { describe, it, expect } from 'vitest';
import { Ok, Err } from '../result';

describe('Result', () => {
  it('Ok wraps a value', () => {
    const r = Ok(42);
    expect(r.isOk()).toBe(true);
    expect(r.isErr()).toBe(false);
    expect(r.value).toBe(42);
  });

  it('Err wraps an error', () => {
    const r = Err('bad');
    expect(r.isOk()).toBe(false);
    expect(r.isErr()).toBe(true);
    expect(r.error).toBe('bad');
  });

  it('unwrap returns value on Ok', () => {
    expect(Ok('hello').unwrap()).toBe('hello');
  });

  it('unwrap throws on Err', () => {
    expect(() => Err('fail').unwrap()).toThrow('fail');
  });

  it('map transforms Ok value', () => {
    const r = Ok(5).map((n) => n * 2);
    expect(r.value).toBe(10);
  });

  it('map does not transform Err', () => {
    const r = Err<number, string>('err').map((n) => n * 2);
    expect(r.isErr()).toBe(true);
    expect(r.error).toBe('err');
  });
});
