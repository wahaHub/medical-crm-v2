import { describe, it, expect } from 'vitest';
import { Hospital } from '../src/entities/hospital.entity.js';

function makeHospital(overrides: Partial<ConstructorParameters<typeof Hospital>[0]> = {}) {
  return new Hospital({
    id: 'h-1', name: 'Test Hospital', nameEn: 'Test Hospital EN',
    address: null, city: null, phone: null, email: null, description: null,
    logoUrl: null, specialties: null,
    status: 'PENDING', type: 'COSMETIC',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('Hospital', () => {
  it('constructs with all fields', () => {
    const h = makeHospital();
    expect(h.id).toBe('h-1');
    expect(h.status).toBe('PENDING');
    expect(h.type).toBe('COSMETIC');
  });

  it('activate() from PENDING', () => {
    const h = makeHospital({ status: 'PENDING' });
    h.activate();
    expect(h.status).toBe('ACTIVE');
  });

  it('activate() from INACTIVE', () => {
    const h = makeHospital({ status: 'INACTIVE' });
    h.activate();
    expect(h.status).toBe('ACTIVE');
  });

  it('activate() throws when already ACTIVE', () => {
    const h = makeHospital({ status: 'ACTIVE' });
    expect(() => h.activate()).toThrow();
  });

  it('deactivate() from ACTIVE', () => {
    const h = makeHospital({ status: 'ACTIVE' });
    h.deactivate();
    expect(h.status).toBe('INACTIVE');
  });

  it('deactivate() throws from PENDING', () => {
    const h = makeHospital({ status: 'PENDING' });
    expect(() => h.deactivate()).toThrow();
  });
});
