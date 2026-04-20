import { describe, expect, it, vi } from 'vitest';
import { DrizzleCaseRepository } from '../../database/repositories/drizzle-case.repository.js';
import type { CrmDb } from '../../database/crm-client.js';

function makeCaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'case-1',
    caseNumber: 'CASE-2026-0001',
    patientId: 'patient-1',
    patientName: 'Alice Example',
    patientCountry: 'US',
    patientLanguage: 'en',
    assignedHospitalId: 'hospital-1',
    primaryDiagnosis: 'Test diagnosis',
    diagnosisCode: 'T00.0',
    symptoms: ['pain'],
    medicalHistory: 'None',
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: 'LOW',
    status: 'ACTIVE',
    stage: 'PENDING_ASSIGNMENT',
    assignedAt: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    assignmentStatus: 'ASSIGNED',
    treatmentStage: 'IN_TREATMENT',
    conditionSummary: null,
    structuredData: null,
    riskFlags: null,
    priority: null,
    lastEventAt: null,
    aiSummaryStatus: 'PENDING',
    questionCollectorTemplateId: null,
    ...overrides,
  };
}

function makeListBuilder(executor: () => Promise<unknown>) {
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

function makeWhereTerminalBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
      return this;
    },
    where() {
      return executor();
    },
  };
}

function makeWhereLimitBuilder(executor: () => Promise<unknown>) {
  return {
    from() {
      return this;
    },
    where() {
      return {
        limit() {
          return executor();
        },
      };
    },
  };
}

describe('DrizzleCaseRepository transient database recovery', () => {
  it('retries findMany once when a transient count query failure occurs', async () => {
    const dbError = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const row = makeCaseRow();
    const select = vi.fn()
      .mockReturnValueOnce(makeListBuilder(async () => [row]))
      .mockReturnValueOnce(makeWhereTerminalBuilder(async () => {
        throw dbError;
      }))
      .mockReturnValueOnce(makeListBuilder(async () => [row]))
      .mockReturnValueOnce(makeWhereTerminalBuilder(async () => [{ total: 1 }]));

    const repo = new DrizzleCaseRepository({ select } as unknown as CrmDb);

    const result = await repo.findMany({ page: 1, limit: 20 }, 'hospital-1');

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('case-1');
    expect(select).toHaveBeenCalledTimes(4);
  });

  it('retries countByFilters once when the first database read is reset', async () => {
    const dbError = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const select = vi.fn()
      .mockReturnValueOnce(makeWhereTerminalBuilder(async () => {
        throw dbError;
      }))
      .mockReturnValueOnce(
        makeWhereTerminalBuilder(async () => [{
          total: 2,
          unassigned: 0,
          assigned: 2,
          inTreatment: 1,
          postTreatment: 0,
          completed: 1,
          followUp: 0,
        }]),
      );

    const repo = new DrizzleCaseRepository({ select } as unknown as CrmDb);

    const stats = await repo.countByFilters({ hospitalId: 'hospital-1' });

    expect(stats).toMatchObject({
      total: 2,
      assigned: 2,
      inTreatment: 1,
      completed: 1,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('retries load case by id twice when the connection resets repeatedly before recovering', async () => {
    const dbError = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const row = makeCaseRow();
    const select = vi.fn()
      .mockReturnValueOnce(makeWhereLimitBuilder(async () => {
        throw dbError;
      }))
      .mockReturnValueOnce(makeWhereLimitBuilder(async () => {
        throw dbError;
      }))
      .mockReturnValueOnce(makeWhereLimitBuilder(async () => [row]));

    const repo = new DrizzleCaseRepository({ select } as unknown as CrmDb);

    const result = await repo.findById('case-1');

    expect(result?.id).toBe('case-1');
    expect(select).toHaveBeenCalledTimes(3);
  });
});
