export type Result<T, E> = OkResult<T, E> | ErrResult<T, E>;

class OkResult<T, E> {
  readonly _tag = 'Ok' as const;
  constructor(readonly value: T) {}
  isOk(): this is OkResult<T, E> { return true; }
  isErr(): this is ErrResult<T, E> { return false; }
  unwrap(): T { return this.value; }
  map<U>(fn: (value: T) => U): Result<U, E> { return new OkResult(fn(this.value)); }
  get error(): never { throw new Error('Cannot access error on Ok'); }
}

class ErrResult<T, E> {
  readonly _tag = 'Err' as const;
  constructor(readonly error: E) {}
  isOk(): this is OkResult<T, E> { return false; }
  isErr(): this is ErrResult<T, E> { return true; }
  unwrap(): never { throw new Error(String(this.error)); }
  map<U>(_fn: (value: T) => U): Result<U, E> { return new ErrResult(this.error); }
  get value(): never { throw new Error('Cannot access value on Err'); }
}

export function Ok<T, E = never>(value: T): Result<T, E> {
  return new OkResult(value);
}

export function Err<T = never, E = string>(error: E): Result<T, E> {
  return new ErrResult(error);
}
