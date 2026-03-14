import { describe, it, expect } from 'vitest';
import { createHospitalSchema, hospitalListQuerySchema } from '../hospital.schema';

describe('createHospitalSchema', () => {
  it('accepts valid input', () => {
    const result = createHospitalSchema.safeParse({
      name: 'Test Hospital',
      type: 'COSMETIC',
      contactEmail: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createHospitalSchema.safeParse({
      name: '',
      type: 'COSMETIC',
      contactEmail: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = createHospitalSchema.safeParse({
      name: 'Test',
      type: 'INVALID',
      contactEmail: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = createHospitalSchema.safeParse({
      name: 'Test',
      type: 'REGULAR',
      contactEmail: 'not-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('hospitalListQuerySchema', () => {
  it('applies defaults', () => {
    const result = hospitalListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string numbers', () => {
    const result = hospitalListQuerySchema.parse({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('rejects limit > 100', () => {
    const result = hospitalListQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });
});
