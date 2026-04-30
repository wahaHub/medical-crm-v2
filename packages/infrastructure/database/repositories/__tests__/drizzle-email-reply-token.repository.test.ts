import { beforeEach, describe, expect, it } from 'vitest';
import { DrizzleEmailReplyTokenRepository } from '../drizzle-email-reply-token.repository.js';
import type { CrmDb } from '../../crm-client.js';
import type { EmailReplyToken } from '@medical-crm/domain';

type TokenRow = {
  id: string;
  tokenHash: string;
  conversationId: string;
  caseId: string;
  patientId: string;
  patientEmail: string;
  channel: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
  hospitalId: string | null;
  sourceKind: string;
  sourceId: string | null;
  expiresAt: string;
  status: 'ACTIVE' | 'REVOKED';
  createdAt: string;
  lastUsedAt: string | null;
  rawToken?: string;
};

function makeToken(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tokenHash: overrides.tokenHash ?? 'hash-active',
    conversationId: overrides.conversationId ?? 'conversation-1',
    caseId: overrides.caseId ?? 'case-1',
    patientId: overrides.patientId ?? 'patient-1',
    patientEmail: overrides.patientEmail ?? 'patient@example.com',
    channel: overrides.channel ?? 'ADMIN_PATIENT',
    hospitalId: overrides.hospitalId ?? null,
    sourceKind: overrides.sourceKind ?? 'message',
    sourceId: overrides.sourceId ?? 'message-1',
    expiresAt: overrides.expiresAt ?? '2026-04-28T12:00:00.000Z',
    status: overrides.status ?? 'ACTIVE',
    createdAt: overrides.createdAt ?? '2026-04-28T09:00:00.000Z',
    lastUsedAt: overrides.lastUsedAt ?? null,
    rawToken: overrides.rawToken,
  };
}

function makeFakeDb(rows: TokenRow[]) {
  const db = {
    select() {
      return {
        from() {
          return {
            where(condition: unknown) {
              return {
                orderBy() {
                  return {
                    limit(limit: number) {
                      return filterRows(rows, condition).slice(0, limit);
                    },
                  };
                },
                limit(limit: number) {
                  return filterRows(rows, condition).slice(0, limit);
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(values: TokenRow) {
          return {
            onConflictDoUpdate() {
              return {
                returning: async () => {
                  const existing = rows.find((row) => row.id === values.id);
                  if (existing) {
                    Object.assign(existing, values);
                    return [existing];
                  }
                  rows.push(values);
                  return [values];
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(values: Partial<TokenRow>) {
          return {
            where(condition: unknown) {
              const matches = filterRows(rows, condition);
              for (const row of matches) Object.assign(row, values);
              return Promise.resolve();
            },
          };
        },
      };
    },
  };

  return db as unknown as CrmDb;
}

function filterRows(rows: TokenRow[], condition: unknown): TokenRow[] {
  return rows.filter((row) => matchesCondition(condition, row));
}

function matchesCondition(node: unknown, row: TokenRow): boolean {
  const clauses = extractClauses(node);
  return clauses.every(({ column, operator, value }) => {
    const rowValue = row[toCamelCase(column) as keyof TokenRow];
    if (operator.includes(' is null')) return rowValue == null;
    if (operator.includes(' = ')) return rowValue === value;
    if (operator.includes(' > ')) return new Date(rowValue as string).getTime() > new Date(value as string).getTime();
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

describe('DrizzleEmailReplyTokenRepository', () => {
  let rows: TokenRow[];
  let repository: DrizzleEmailReplyTokenRepository;

  beforeEach(() => {
    rows = [];
    repository = new DrizzleEmailReplyTokenRepository(makeFakeDb(rows));
  });

  it('findReusable returns only active, unexpired matching token', async () => {
    rows.push(
      makeToken({ id: 'expired', tokenHash: 'expired', expiresAt: '2026-04-28T09:59:59.000Z' }),
      makeToken({ id: 'revoked', tokenHash: 'revoked', status: 'REVOKED' }),
      makeToken({ id: 'other-source', tokenHash: 'other-source', sourceId: 'message-2' }),
      makeToken({ id: 'active', tokenHash: 'active', expiresAt: '2026-04-28T10:01:00.000Z' }),
    );

    const token = await repository.findReusable({
      conversationId: 'conversation-1',
      patientId: 'patient-1',
      sourceKind: 'message',
      sourceId: 'message-1',
      now: new Date('2026-04-28T10:00:00.000Z'),
    });

    expect(token?.id).toBe('active');
  });

  it('findByTokenHash returns the token and never raw token data', async () => {
    rows.push(makeToken({ id: 'token-1', tokenHash: 'stored-hash', rawToken: 'raw-secret-token' }));

    const token = await repository.findByTokenHash('stored-hash');

    expect(token?.id).toBe('token-1');
    expect(token?.tokenHash).toBe('stored-hash');
    expect((token as EmailReplyToken & { rawToken?: string } | null)?.rawToken).toBeUndefined();
  });
});
