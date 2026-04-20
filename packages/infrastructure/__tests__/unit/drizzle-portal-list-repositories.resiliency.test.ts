import { describe, expect, it, vi } from 'vitest';
import { DrizzleEmailTemplateRepository } from '../../database/repositories/drizzle-email-template.repository.js';
import { DrizzleChatbotFaqRepository } from '../../database/repositories/drizzle-chatbot-faq.repository.js';
import type { CrmDb } from '../../database/crm-client.js';

function makeEmailTemplateRow() {
  return {
    id: 'template-1',
    hospitalId: 'hospital-1',
    name: 'Welcome',
    type: 'GENERAL',
    subject: 'Hello',
    body: '<p>Hello</p>',
    variables: [],
    status: 'ACTIVE',
    attachments: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    deletedAt: null,
  };
}

function makeFaqRow() {
  return {
    id: 'faq-1',
    category: 'General',
    question: 'How does this work?',
    answer: 'Like this.',
    hospitalType: 'REGULAR',
    keywords: [],
    isActive: true,
    sortOrder: 0,
    hospitalId: null,
    attachments: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
  };
}

function makeCategoryRow() {
  return {
    id: 'category-1',
    name: 'General',
    hospitalType: 'REGULAR',
    hospitalId: null,
    sortOrder: 0,
    isActive: true,
    translations: {},
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
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

function makeOrderByBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
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

describe('portal list repository transient recovery', () => {
  it('retries email template list reads once when the count query hits max clients', async () => {
    const transientError = Object.assign(
      new Error('Max client connections reached'),
      { code: 'XX000' },
    );

    const select = vi.fn()
      .mockReturnValueOnce(makeLimitOffsetBuilder(async () => [makeEmailTemplateRow()]))
      .mockReturnValueOnce(makeWhereBuilder(async () => {
        throw transientError;
      }))
      .mockReturnValueOnce(makeLimitOffsetBuilder(async () => [makeEmailTemplateRow()]))
      .mockReturnValueOnce(makeWhereBuilder(async () => [{ total: 1 }]));

    const repo = new DrizzleEmailTemplateRepository({ select } as unknown as CrmDb);
    const result = await repo.findByHospital('hospital-1', { page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('template-1');
    expect(select).toHaveBeenCalledTimes(4);
  });

  it('retries chatbot faq list reads once when the count query times out', async () => {
    const transientError = Object.assign(
      new Error('write CONNECT_TIMEOUT aws-1-us-east-2.pooler.supabase.com:5432'),
      { code: 'CONNECT_TIMEOUT' },
    );

    const select = vi.fn()
      .mockReturnValueOnce(makeLimitOffsetBuilder(async () => [makeFaqRow()]))
      .mockReturnValueOnce(makeWhereBuilder(async () => {
        throw transientError;
      }))
      .mockReturnValueOnce(makeLimitOffsetBuilder(async () => [makeFaqRow()]))
      .mockReturnValueOnce(makeWhereBuilder(async () => [{ total: 1 }]));

    const repo = new DrizzleChatbotFaqRepository({ select } as unknown as CrmDb);
    const result = await repo.findAll({ page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('faq-1');
    expect(select).toHaveBeenCalledTimes(4);
  });

  it('retries chatbot faq category reads when the grouped count query hits session-mode pool exhaustion', async () => {
    const transientError = Object.assign(
      new Error('MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size'),
      { code: 'XX000' },
    );

    const select = vi.fn()
      .mockReturnValueOnce(makeOrderByBuilder(async () => [makeCategoryRow()]))
      .mockReturnValueOnce(makeGroupByBuilder(async () => {
        throw transientError;
      }))
      .mockReturnValueOnce(makeOrderByBuilder(async () => [makeCategoryRow()]))
      .mockReturnValueOnce(makeGroupByBuilder(async () => [
        { category: 'General', hospitalType: 'REGULAR', total: 1 },
      ]));

    const repo = new DrizzleChatbotFaqRepository({ select } as unknown as CrmDb);
    const result = await repo.listCategories({});

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('General');
    expect(result[0]?.questionCount).toBe(1);
    expect(select).toHaveBeenCalledTimes(4);
  });
});
