import { describe, expect, it, vi } from 'vitest';
import { DrizzleConversationRepository } from '../../database/repositories/drizzle-conversation.repository.js';
import type { CrmDb } from '../../database/crm-client.js';

function makeWhereBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
      return this;
    },
    innerJoin() {
      return this;
    },
    where() {
      return this;
    },
    limit() {
      return executor();
    },
    orderBy() {
      return executor();
    },
  };
}

describe('message access repository transient retry', () => {
  it('retries focused patient access checks when the first read hits max clients', async () => {
    const transientError = Object.assign(
      new Error('Max client connections reached'),
      { code: 'XX000' },
    );

    const select = vi.fn()
      .mockReturnValueOnce(makeWhereBuilder(async () => {
        throw transientError;
      }))
      .mockReturnValueOnce(makeWhereBuilder(async () => [{ id: 'conversation-1' }]));

    const repo = new DrizzleConversationRepository({ select } as unknown as CrmDb);
    const result = await repo.hasPatientAccess('patient-1', 'conversation-1');

    expect(result).toBe(true);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
