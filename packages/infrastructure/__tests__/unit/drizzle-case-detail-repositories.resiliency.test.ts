import { describe, expect, it, vi } from 'vitest';
import { DrizzleCaseProgressRepository } from '../../database/repositories/drizzle-case-progress.repository.js';
import { DrizzleConversationRepository } from '../../database/repositories/drizzle-conversation.repository.js';
import { DrizzleMessageRepository } from '../../database/repositories/drizzle-message.repository.js';
import type { CrmDb } from '../../database/crm-client.js';

function makeCaseProgressRow() {
  return {
    id: 'progress-1',
    caseId: 'case-1',
    title: 'Follow-up',
    description: 'Stable',
    progressType: 'STATUS_CHANGE',
    videoSummary: null,
    recordedAt: '2026-04-20T00:00:00.000Z',
    recordedById: 'user-1',
  };
}

function makeConversationRow() {
  return {
    id: 'conversation-1',
    caseId: 'case-1',
    category: 'HOSPITAL_PATIENT',
    title: 'Patient Follow-up',
    hospitalId: 'hospital-1',
    assistantMode: 'AI_ACTIVE',
    lastMessageId: null,
    lastMessageAt: '2026-04-20T00:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastSenderId: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
  };
}

function makeOrderByBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
      return this;
    },
    leftJoin() {
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return executor();
    },
  };
}

function makeLimitOffsetBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    offset() {
      return executor();
    },
  };
}

function makeWhereBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
      return this;
    },
    where() {
      return executor();
    },
  };
}

function makeGroupByBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
      return this;
    },
    where() {
      return this;
    },
    groupBy() {
      return executor();
    },
  };
}

describe('case detail repository transient retry', () => {
  it('retries case progress reads when the first query fails with CONNECTION_CLOSED', async () => {
    const transientError = Object.assign(
      new Error('write CONNECTION_CLOSED aws-1-us-east-2.pooler.supabase.com:5432'),
      { code: 'CONNECTION_CLOSED' },
    );

    const select = vi.fn()
      .mockReturnValueOnce(makeOrderByBuilder(async () => {
        throw transientError;
      }))
      .mockReturnValueOnce(makeOrderByBuilder(async () => [makeCaseProgressRow()]));

    const repo = new DrizzleCaseProgressRepository({ select } as unknown as CrmDb);
    const result = await repo.findByCaseId('case-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('progress-1');
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('retries conversation list reads when the count query fails with CONNECTION_CLOSED', async () => {
    const transientError = Object.assign(
      new Error('write CONNECTION_CLOSED aws-1-us-east-2.pooler.supabase.com:5432'),
      { code: 'CONNECTION_CLOSED' },
    );

    const select = vi.fn()
      .mockReturnValueOnce(makeLimitOffsetBuilder(async () => [makeConversationRow()]))
      .mockReturnValueOnce(makeWhereBuilder(async () => {
        throw transientError;
      }))
      .mockReturnValueOnce(makeLimitOffsetBuilder(async () => [makeConversationRow()]))
      .mockReturnValueOnce(makeWhereBuilder(async () => [{ total: 1 }]));

    const repo = new DrizzleConversationRepository({ select } as unknown as CrmDb);
    const result = await repo.findMany({ page: 1, limit: 20, caseId: 'case-1' }, 'hospital-1');

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('conversation-1');
    expect(select).toHaveBeenCalledTimes(4);
  });

  it('retries batched message count reads when the grouped count query fails with CONNECTION_CLOSED', async () => {
    const transientError = Object.assign(
      new Error('write CONNECTION_CLOSED aws-1-us-east-2.pooler.supabase.com:5432'),
      { code: 'CONNECTION_CLOSED' },
    );

    const select = vi.fn()
      .mockReturnValueOnce(makeGroupByBuilder(async () => {
        throw transientError;
      }))
      .mockReturnValueOnce(makeGroupByBuilder(async () => [
        { conversationId: 'conversation-1', total: 2 },
        { conversationId: 'conversation-2', total: 3 },
      ]));

    const repo = new DrizzleMessageRepository({ select } as unknown as CrmDb);
    const result = await repo.countByConversationIds(['conversation-1', 'conversation-2']);

    expect(result).toEqual({
      'conversation-1': 2,
      'conversation-2': 3,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });
});
