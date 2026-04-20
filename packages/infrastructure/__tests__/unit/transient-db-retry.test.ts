import { describe, expect, it } from 'vitest';
import { isTransientDatabaseError } from '../../database/transient-db-retry.js';

describe('isTransientDatabaseError', () => {
  it('treats postgres CONNECTION_CLOSED errors as transient', () => {
    const error = {
      message: 'Failed query',
      cause: Object.assign(
        new Error('write CONNECTION_CLOSED aws-1-us-east-2.pooler.supabase.com:5432'),
        { code: 'CONNECTION_CLOSED' },
      ),
    };

    expect(isTransientDatabaseError(error)).toBe(true);
  });

  it('treats CONNECT_TIMEOUT errors from the pooler as transient', () => {
    const error = {
      message: 'Failed query',
      cause: Object.assign(
        new Error('write CONNECT_TIMEOUT aws-1-us-east-2.pooler.supabase.com:5432'),
        { code: 'CONNECT_TIMEOUT' },
      ),
    };

    expect(isTransientDatabaseError(error)).toBe(true);
  });

  it('treats pool exhaustion errors as transient service pressure', () => {
    const sessionModeError = {
      message: 'Failed query',
      cause: Object.assign(
        new Error('MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size'),
        { code: 'XX000' },
      ),
    };
    const maxClientsError = {
      message: 'Failed query',
      cause: Object.assign(
        new Error('Max client connections reached'),
        { code: 'XX000' },
      ),
    };

    expect(isTransientDatabaseError(sessionModeError)).toBe(true);
    expect(isTransientDatabaseError(maxClientsError)).toBe(true);
  });

  it('does not treat unrelated application errors as transient', () => {
    expect(isTransientDatabaseError(new Error('validation failed'))).toBe(false);
  });
});
