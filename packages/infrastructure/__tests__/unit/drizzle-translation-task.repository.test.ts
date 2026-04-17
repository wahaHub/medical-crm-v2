import { describe, it, expect, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { DrizzleTranslationTaskRepository } from '../../database/repositories/drizzle-translation-task.repository.js';
import { translationTasks } from '../../database/schema/index.js';
import type { CrmDb } from '../../database/crm-client.js';

type TaskRow = Record<string, unknown>;

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function getRowValue(row: TaskRow, column: { name: string }): unknown {
  return row[column.name] ?? row[toCamelCase(column.name)] ?? null;
}

function isSqlNode(value: unknown): value is { queryChunks: unknown[] } {
  return Boolean(value && typeof value === 'object' && 'queryChunks' in value);
}

function extractConditions(node: unknown): Array<{ column: { name: string }; operator: string; value: unknown }> {
  if (!isSqlNode(node)) return [];

  const clauses: Array<{ column: { name: string }; operator: string; value: unknown }> = [];
  const chunks = node.queryChunks;

  for (const chunk of chunks) {
    if (isSqlNode(chunk)) {
      clauses.push(...extractConditions(chunk));
    }
  }

  const column = chunks.find(
    (chunk): chunk is { name: string } => Boolean(chunk && typeof chunk === 'object' && 'name' in chunk),
  );
  const operatorChunk = chunks.find(
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
  const arrayParam = chunks.find((chunk): chunk is Array<{ value: unknown }> => Array.isArray(chunk));

  if (column && operatorChunk) {
    clauses.push({
      column,
      operator: operatorChunk.value.join(''),
      value: arrayParam ? arrayParam.map((item) => item.value) : param?.value,
    });
  }

  return clauses;
}

function evaluateCondition(node: unknown, row: TaskRow): boolean {
  const clauses = extractConditions(node);
  if (clauses.length === 0) return false;

  return clauses.every(({ column, operator, value }) => {
    const rowValue = getRowValue(row, column);
    if (operator.includes(' = ')) {
      return rowValue === value;
    }
    if (operator.includes(' in ')) {
      return Array.isArray(value) && value.includes(rowValue);
    }
    return false;
  });
}

function evaluateMergeExpression(value: unknown, existing: TaskRow): unknown {
  if (!isSqlNode(value)) return value;

  const incomingChunk = value.queryChunks.find(
    (chunk) =>
      Boolean(
        chunk &&
          typeof chunk === 'object' &&
          !isSqlNode(chunk) &&
          !('name' in chunk) &&
          !('value' in chunk),
      ),
  ) as { valueOf?: () => unknown } | undefined;
  const incomingValue = incomingChunk?.valueOf?.() ?? incomingChunk;
  const incoming =
    typeof incomingValue === 'string' ? JSON.parse(incomingValue) : (incomingValue ?? {});
  return {
    ...(existing.fieldsToTranslate as Record<string, unknown>),
    ...(incoming as Record<string, unknown>),
  };
}

function makeFakeDb(initialRows: TaskRow[] = []) {
  const rows = initialRows;

  const selectBuilder = {
    from() {
      return {
        where(condition: unknown) {
          return {
            limit(limitValue: number) {
              return {
                for() {
                  return {
                    async execute() {
                      return rows.filter((row) => evaluateCondition(condition, row)).slice(0, limitValue);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const updateBuilder = {
    set(values: Record<string, unknown>) {
      return {
        where(condition: unknown) {
          return {
            async returning() {
              const updated: TaskRow[] = [];
              for (const row of rows) {
                if (!evaluateCondition(condition, row)) continue;
                for (const [key, value] of Object.entries(values)) {
                  row[key] = evaluateMergeExpression(value, row);
                }
                updated.push({ ...row });
              }
              return updated;
            },
          };
        },
      };
    },
  };

  const insertBuilder = {
    values(values: Record<string, unknown>) {
      return {
        async returning() {
          const row: TaskRow = {
            id: values.id,
            sourceDb: values.sourceDb,
            entityType: values.entityType,
            entityId: values.entityId,
            hospitalType: values.hospitalType ?? null,
            fieldsToTranslate: values.fieldsToTranslate ?? {},
            targetLanguages: values.targetLanguages ?? [],
            targetLanguage: values.targetLanguage ?? null,
            chunkKey: values.chunkKey ?? 'default',
            sourceLanguage: values.sourceLanguage ?? null,
            detectedLanguage: values.detectedLanguage ?? null,
            status: values.status ?? 'pending',
            errorMessage: values.errorMessage ?? null,
            retryCount: values.retryCount ?? 0,
            createdAt: values.createdAt ?? new Date().toISOString(),
            startedAt: values.startedAt ?? null,
            completedAt: values.completedAt ?? null,
          };
          rows.push(row);
          return [row];
        },
      };
    },
  };

  const db = {
    async transaction<T>(fn: (tx: typeof db) => Promise<T>) {
      return fn(db);
    },
    select: () => selectBuilder,
    update: () => updateBuilder,
    insert: () => insertBuilder,
    execute: async () => ({ rows: [] }),
  };

  return { db: db as unknown as CrmDb, rows };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    sourceDb: 'crm',
    entityType: 'hospital',
    entityId: 'hospital-1',
    fieldsToTranslate: { name: 'A' },
    targetLanguages: ['en'],
    ...overrides,
  };
}

describe('DrizzleTranslationTaskRepository.upsert', () => {
  let rows: TaskRow[];
  let repo: DrizzleTranslationTaskRepository;

  beforeEach(() => {
    const fakeDb = makeFakeDb();
    rows = fakeDb.rows;
    repo = new DrizzleTranslationTaskRepository(fakeDb.db);
  });

  it('allows the same entity in different chunks', async () => {
    await repo.upsert(makeInput({ chunkKey: 'overview', targetLanguage: 'en' }));
    await repo.upsert(makeInput({ chunkKey: 'details', targetLanguage: 'en', fieldsToTranslate: { description: 'B' } }));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.chunkKey)).toEqual(['overview', 'details']);
  });

  it('allows the same entity and chunk across different target languages', async () => {
    await repo.upsert(makeInput({ chunkKey: 'overview', targetLanguage: 'en' }));
    await repo.upsert(makeInput({ chunkKey: 'overview', targetLanguage: 'ko', fieldsToTranslate: { name: 'A-ko' } }));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.targetLanguage)).toEqual(['en', 'ko']);
  });

  it('merges the same entity, chunk, and target language instead of inserting a duplicate', async () => {
    const first = await repo.upsert(makeInput({
      chunkKey: 'overview',
      targetLanguage: 'en',
      fieldsToTranslate: { name: 'A', description: 'First' },
    }));
    const second = await repo.upsert(makeInput({
      chunkKey: 'overview',
      targetLanguage: 'en',
      fieldsToTranslate: { summary: 'Second' },
    }));

    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(rows[0]?.fieldsToTranslate).toEqual({
      name: 'A',
      description: 'First',
      summary: 'Second',
    });
  });

  it('merges the same identity even when the existing row is completed', async () => {
    const first = await repo.upsert(makeInput({
      chunkKey: 'details',
      targetLanguage: 'ko',
      fieldsToTranslate: { name: 'A', summary: 'First' },
    }));
    rows[0]!.status = 'completed';

    const second = await repo.upsert(makeInput({
      chunkKey: 'details',
      targetLanguage: 'ko',
      fieldsToTranslate: { summary: 'Second' },
    }));

    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.fieldsToTranslate).toEqual({
      name: 'A',
      summary: 'Second',
    });
  });
});
