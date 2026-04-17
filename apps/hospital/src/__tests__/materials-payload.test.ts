import { describe, expect, it } from 'vitest';
import { sanitizeDepartmentStats } from '../lib/materials-payload';

describe('sanitizeDepartmentStats', () => {
  it('removes null values from department stats before submitting materials info', () => {
    expect(sanitizeDepartmentStats({
      general_surgery: {
        specialists: null,
        annualPatients: null,
      },
      cardiology: {
        specialists: 12,
        annualPatients: null,
      },
    })).toEqual({
      general_surgery: {},
      cardiology: {
        specialists: 12,
      },
    });
  });
});
