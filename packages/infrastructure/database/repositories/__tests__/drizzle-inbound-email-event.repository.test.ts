import { beforeEach, describe, expect, it } from 'vitest';
import { DrizzleInboundEmailEventRepository } from '../drizzle-inbound-email-event.repository.js';
import type { CrmDb } from '../../crm-client.js';

type EventRow = {
  id: string;
  provider: 'resend';
  providerEventId: string | null;
  providerMessageId: string | null;
  replyTokenId: string | null;
  conversationId: string | null;
  caseId: string | null;
  fromEmail: string | null;
  subject: string | null;
  status:
    | 'PROCESSING'
    | 'PROCESSED'
    | 'TOKEN_NOT_FOUND'
    | 'TOKEN_EXPIRED'
    | 'SENDER_MISMATCH'
    | 'EMAIL_AUTH_FAILED'
    | 'CONVERSATION_INVALID'
    | 'EMPTY_REPLY'
    | 'FAILED';
  error: string | null;
  createdMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

function makeFakeDb(rows: EventRow[]) {
  const db = {
    select() {
      return {
        from() {
          return {
            where(condition: unknown) {
              return {
                limit(limit: number) {
                  return Promise.resolve(filterRows(rows, condition).slice(0, limit));
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(values: Partial<EventRow>) {
          return {
            onConflictDoNothing() {
              return {
                returning: async () => {
                  if (
                    values.providerEventId &&
                    rows.some((row) => row.provider === values.provider && row.providerEventId === values.providerEventId)
                  ) {
                    return [];
                  }
                  if (
                    values.providerMessageId &&
                    rows.some((row) => row.provider === values.provider && row.providerMessageId === values.providerMessageId)
                  ) {
                    return [];
                  }

                  const row = makeEventRow(values);
                  rows.push(row);
                  return [row];
                },
              };
            },
            returning: async () => {
              if (
                values.providerEventId &&
                rows.some((row) => row.provider === values.provider && row.providerEventId === values.providerEventId)
              ) {
                throw Object.assign(new Error('duplicate key value violates unique constraint "inbound_email_events_provider_event_key"'), {
                  code: '23505',
                });
              }
              if (
                values.providerMessageId &&
                rows.some((row) => row.provider === values.provider && row.providerMessageId === values.providerMessageId)
              ) {
                throw Object.assign(new Error('duplicate key value violates unique constraint "inbound_email_events_provider_message_key"'), {
                  code: '23505',
                });
              }
              const row = makeEventRow(values);
              rows.push(row);
              return [row];
            },
          };
        },
      };
    },
    update() {
      return {
        set(values: Partial<EventRow>) {
          return {
            where(condition: unknown) {
              for (const row of filterRows(rows, condition)) Object.assign(row, values);
              return Promise.resolve();
            },
          };
        },
      };
    },
  };

  return db as unknown as CrmDb;
}

function makeEventRow(values: Partial<EventRow>): EventRow {
  return {
    id: values.id ?? crypto.randomUUID(),
    provider: values.provider ?? 'resend',
    providerEventId: values.providerEventId ?? null,
    providerMessageId: values.providerMessageId ?? null,
    replyTokenId: values.replyTokenId ?? null,
    conversationId: values.conversationId ?? null,
    caseId: values.caseId ?? null,
    fromEmail: values.fromEmail ?? null,
    subject: values.subject ?? null,
    status: values.status ?? 'PROCESSING',
    error: values.error ?? null,
    createdMessageId: values.createdMessageId ?? null,
    createdAt: values.createdAt ?? '2026-04-28T10:00:00.000Z',
    updatedAt: values.updatedAt ?? '2026-04-28T10:00:00.000Z',
  };
}

function filterRows(rows: EventRow[], condition: unknown): EventRow[] {
  return rows.filter((row) => matchesCondition(condition, row));
}

function matchesCondition(node: unknown, row: EventRow): boolean {
  const clauses = extractClauses(node);
  return clauses.every(({ column, operator, value }) => {
    const rowValue = row[toCamelCase(column) as keyof EventRow];
    if (operator.includes(' = ')) return rowValue === value;
    return true;
  });
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function extractClauses(node: unknown): Array<{ column: string; operator: string; value: unknown }> {
  if (!node || typeof node !== 'object' || !('queryChunks' in node)) return [];
  const chunks = (node as { queryChunks: unknown[] }).queryChunks;
  const nested = chunks.flatMap(extractClauses);
  const column = chunks.find((chunk): chunk is { name: string } => Boolean(chunk && typeof chunk === 'object' && 'name' in chunk));
  const operator = chunks.find(
    (chunk): chunk is { value: string[] } =>
      Boolean(
        chunk &&
          typeof chunk === 'object' &&
          'value' in chunk &&
          Array.isArray((chunk as { value: unknown }).value) &&
          (chunk as { value: string[] }).value.join('').trim().length > 0,
      ),
  );
  const param = chunks.find(
    (chunk): chunk is { value: unknown } =>
      Boolean(chunk && typeof chunk === 'object' && 'value' in chunk && !Array.isArray((chunk as { value: unknown }).value)),
  );
  if (!column || !operator) return nested;
  return [...nested, { column: column.name, operator: operator.value.join(''), value: param?.value }];
}

describe('DrizzleInboundEmailEventRepository', () => {
  let rows: EventRow[];
  let repository: DrizzleInboundEmailEventRepository;

  beforeEach(() => {
    rows = [];
    repository = new DrizzleInboundEmailEventRepository(makeFakeDb(rows));
  });

  it('claim returns alreadyClaimed false for first event', async () => {
    const result = await repository.claim({
      provider: 'resend',
      providerEventId: 'evt-1',
      providerMessageId: 'msg-1',
    });

    expect(result.alreadyClaimed).toBe(false);
    expect(result.event.providerEventId).toBe('evt-1');
    expect(result.event.providerMessageId).toBe('msg-1');
    expect(result.event.status).toBe('PROCESSING');
    expect(rows).toHaveLength(1);
  });

  it('claim returns alreadyClaimed true for duplicate provider event id', async () => {
    const first = await repository.claim({
      provider: 'resend',
      providerEventId: 'evt-1',
      providerMessageId: 'msg-1',
    });
    const duplicate = await repository.claim({
      provider: 'resend',
      providerEventId: 'evt-1',
    });

    expect(duplicate.alreadyClaimed).toBe(true);
    expect(duplicate.event.id).toBe(first.event.id);
    expect(rows).toHaveLength(1);
  });

  it('claim returns alreadyClaimed true for duplicate provider message id', async () => {
    const first = await repository.claim({
      provider: 'resend',
      providerMessageId: 'msg-1',
    });
    const duplicate = await repository.claim({
      provider: 'resend',
      providerMessageId: 'msg-1',
    });

    expect(duplicate.alreadyClaimed).toBe(true);
    expect(duplicate.event.id).toBe(first.event.id);
    expect(rows).toHaveLength(1);
  });

  it('claim returns alreadyClaimed true when both duplicate identifiers resolve to the same row', async () => {
    const first = await repository.claim({
      provider: 'resend',
      providerEventId: 'evt-1',
      providerMessageId: 'msg-1',
    });
    const duplicate = await repository.claim({
      provider: 'resend',
      providerEventId: 'evt-1',
      providerMessageId: 'msg-1',
    });

    expect(duplicate.alreadyClaimed).toBe(true);
    expect(duplicate.event.id).toBe(first.event.id);
    expect(rows).toHaveLength(1);
  });

  it('claim throws when duplicate identifiers resolve to different rows', async () => {
    await repository.claim({
      provider: 'resend',
      providerEventId: 'evt-1',
    });
    await repository.claim({
      provider: 'resend',
      providerMessageId: 'msg-1',
    });

    await expect(repository.claim({
      provider: 'resend',
      providerEventId: 'evt-1',
      providerMessageId: 'msg-1',
    })).rejects.toThrow('Inbound email provider identifiers resolve to different events');

    expect(rows).toHaveLength(2);
  });

  it('complete persists audit and routing fields', async () => {
    const claimed = await repository.claim({
      provider: 'resend',
      providerMessageId: 'msg-2',
    });

    await repository.complete({
      id: claimed.event.id,
      status: 'PROCESSED',
      replyTokenId: 'reply-token-1',
      conversationId: 'conversation-1',
      caseId: 'case-1',
      fromEmail: 'patient@example.com',
      subject: 'Re: care plan',
      createdMessageId: 'message-1',
      error: null,
    });

    expect(rows[0]).toMatchObject({
      status: 'PROCESSED',
      replyTokenId: 'reply-token-1',
      conversationId: 'conversation-1',
      caseId: 'case-1',
      fromEmail: 'patient@example.com',
      subject: 'Re: care plan',
      createdMessageId: 'message-1',
      error: null,
    });
  });
});
