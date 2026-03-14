import { describe, it, expect } from 'vitest';
import { caseListQuerySchema, caseStatusSchema } from '../case.schema';

describe('caseStatusSchema', () => {
  it('accepts valid statuses', () => {
    expect(caseStatusSchema.parse('DRAFT')).toBe('DRAFT');
    expect(caseStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
  });

  it('rejects invalid status', () => {
    const result = caseStatusSchema.safeParse('UNKNOWN');
    expect(result.success).toBe(false);
  });
});

describe('caseListQuerySchema', () => {
  it('applies defaults', () => {
    const result = caseListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string numbers', () => {
    const result = caseListQuerySchema.parse({ page: '2', limit: '50' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it('rejects limit > 100', () => {
    const result = caseListQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });

  it('validates hospitalId as UUID', () => {
    const result = caseListQuerySchema.safeParse({ hospitalId: 'not-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts valid hospitalId UUID', () => {
    const result = caseListQuerySchema.safeParse({
      hospitalId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });
});
