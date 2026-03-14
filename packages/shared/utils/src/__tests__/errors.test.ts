import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  DomainError,
  mapErrorToStatus,
} from '../errors';

describe('DomainError subclasses', () => {
  it('NotFoundError has correct code and is DomainError', () => {
    const err = new NotFoundError('Hospital not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Hospital not found');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('ConflictError has correct code', () => {
    const err = new ConflictError('Already exists');
    expect(err.code).toBe('CONFLICT');
  });

  it('ValidationError has correct code and details', () => {
    const details = [{ field: 'name', message: 'required' }];
    const err = new ValidationError('Invalid input', details);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.details).toEqual(details);
  });

  it('ForbiddenError has correct code', () => {
    const err = new ForbiddenError('Not allowed');
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('mapErrorToStatus', () => {
  it('maps NOT_FOUND to 404', () => {
    expect(mapErrorToStatus('NOT_FOUND')).toBe(404);
  });

  it('maps VALIDATION_FAILED to 422', () => {
    expect(mapErrorToStatus('VALIDATION_FAILED')).toBe(422);
  });

  it('maps CONFLICT to 409', () => {
    expect(mapErrorToStatus('CONFLICT')).toBe(409);
  });

  it('maps FORBIDDEN to 403', () => {
    expect(mapErrorToStatus('FORBIDDEN')).toBe(403);
  });

  it('maps unknown code to 500', () => {
    expect(mapErrorToStatus('UNKNOWN')).toBe(500);
  });
});
