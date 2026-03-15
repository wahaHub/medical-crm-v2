import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseHospitalSyncService } from '../../services/supabase-hospital-sync.service.js';
import { Hospital } from '@medical-crm/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

// Helper to build a mock Supabase client
function makeMockSupabase(upsertResult: { error: { message: string } | null } = { error: null }): SupabaseClient {
  const upsertMock = vi.fn().mockResolvedValue(upsertResult);
  const fromMock = vi.fn(() => ({
    upsert: upsertMock,
  }));
  return {
    from: fromMock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as SupabaseClient;
}

function makeHospital(overrides: Partial<ConstructorParameters<typeof Hospital>[0]> = {}): Hospital {
  return new Hospital({
    id: 'hosp-uuid-1',
    name: '测试医院',
    nameEn: 'Test Hospital',
    address: '123 Main St',
    phone: '+1-555-0100',
    email: 'contact@hospital.com',
    description: 'A test hospital',
    logoUrl: null,
    specialties: ['dermatology'],
    status: 'ACTIVE',
    type: 'COSMETIC',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    ...overrides,
  });
}

describe('SupabaseHospitalSyncService', () => {
  let mainSupabase: SupabaseClient;
  let chinaSupabase: SupabaseClient;
  let service: SupabaseHospitalSyncService;

  beforeEach(() => {
    mainSupabase = makeMockSupabase();
    chinaSupabase = makeMockSupabase();
    service = new SupabaseHospitalSyncService(mainSupabase, chinaSupabase);
  });

  describe('COSMETIC hospitals', () => {
    it('syncs a COSMETIC hospital to mainSupabase', async () => {
      const hospital = makeHospital({ type: 'COSMETIC' });
      await service.syncToSupabase(hospital);

      expect(mainSupabase.from).toHaveBeenCalledWith('hospitals');
      expect(chinaSupabase.from).not.toHaveBeenCalled();
    });

    it('upserts with correct field mapping for COSMETIC', async () => {
      const hospital = makeHospital({ type: 'COSMETIC', status: 'ACTIVE' });
      await service.syncToSupabase(hospital);

      const fromMock = mainSupabase.from as ReturnType<typeof vi.fn>;
      const upsertMock = fromMock.mock.results[0]!.value.upsert as ReturnType<typeof vi.fn>;
      const upsertData = upsertMock.mock.calls[0]![0] as {
        id: string;
        slug: string;
        name: string;
        is_active: boolean;
      };

      expect(upsertData.id).toBe('hosp-uuid-1');
      expect(upsertData.slug).toBe('test-hospital');
      expect(upsertData.name).toBe('测试医院');
      expect(upsertData.is_active).toBe(true);
    });

    it('sets is_active to false for non-ACTIVE COSMETIC hospital', async () => {
      const hospital = makeHospital({ type: 'COSMETIC', status: 'INACTIVE' });
      await service.syncToSupabase(hospital);

      const fromMock = mainSupabase.from as ReturnType<typeof vi.fn>;
      const upsertMock = fromMock.mock.results[0]!.value.upsert as ReturnType<typeof vi.fn>;
      const upsertData = upsertMock.mock.calls[0]![0] as { is_active: boolean };
      expect(upsertData.is_active).toBe(false);
    });

    it('throws when mainSupabase returns an error', async () => {
      mainSupabase = makeMockSupabase({ error: { message: 'DB connection failed' } });
      service = new SupabaseHospitalSyncService(mainSupabase, chinaSupabase);

      const hospital = makeHospital({ type: 'COSMETIC' });
      await expect(service.syncToSupabase(hospital)).rejects.toThrow(
        'Failed to sync hospital hosp-uuid-1 to main Supabase: DB connection failed',
      );
    });
  });

  describe('REGULAR hospitals', () => {
    it('syncs a REGULAR hospital to chinaSupabase', async () => {
      const hospital = makeHospital({ type: 'REGULAR' });
      await service.syncToSupabase(hospital);

      expect(chinaSupabase.from).toHaveBeenCalledWith('hospitals');
      expect(mainSupabase.from).not.toHaveBeenCalled();
    });

    it('upserts with correct field mapping for REGULAR', async () => {
      const hospital = makeHospital({ type: 'REGULAR', status: 'ACTIVE', address: 'Beijing' });
      await service.syncToSupabase(hospital);

      const fromMock = chinaSupabase.from as ReturnType<typeof vi.fn>;
      const upsertMock = fromMock.mock.results[0]!.value.upsert as ReturnType<typeof vi.fn>;
      const upsertData = upsertMock.mock.calls[0]![0] as {
        id: string;
        slug: string;
        city: string;
        address: string;
        is_active: boolean;
        status: string;
      };

      expect(upsertData.id).toBe('hosp-uuid-1');
      expect(upsertData.slug).toBe('test-hospital');
      expect(upsertData.city).toBe('Beijing');
      expect(upsertData.address).toBe('Beijing');
      expect(upsertData.is_active).toBe(true);
      expect(upsertData.status).toBe('approved');
    });

    it('sets status to pending for non-ACTIVE REGULAR hospital', async () => {
      const hospital = makeHospital({ type: 'REGULAR', status: 'PENDING' });
      await service.syncToSupabase(hospital);

      const fromMock = chinaSupabase.from as ReturnType<typeof vi.fn>;
      const upsertMock = fromMock.mock.results[0]!.value.upsert as ReturnType<typeof vi.fn>;
      const upsertData = upsertMock.mock.calls[0]![0] as { status: string };
      expect(upsertData.status).toBe('pending');
    });

    it('throws when chinaSupabase returns an error', async () => {
      chinaSupabase = makeMockSupabase({ error: { message: 'Write failed' } });
      service = new SupabaseHospitalSyncService(mainSupabase, chinaSupabase);

      const hospital = makeHospital({ type: 'REGULAR' });
      await expect(service.syncToSupabase(hospital)).rejects.toThrow(
        'Failed to sync hospital hosp-uuid-1 to China Supabase: Write failed',
      );
    });
  });

  describe('slug generation', () => {
    it('converts spaces to hyphens and lowercases', async () => {
      const hospital = makeHospital({ type: 'COSMETIC', nameEn: 'Beijing Cosmetic Center' });
      await service.syncToSupabase(hospital);

      const fromMock = mainSupabase.from as ReturnType<typeof vi.fn>;
      const upsertMock = fromMock.mock.results[0]!.value.upsert as ReturnType<typeof vi.fn>;
      const upsertData = upsertMock.mock.calls[0]![0] as { slug: string };
      expect(upsertData.slug).toBe('beijing-cosmetic-center');
    });

    it('removes leading and trailing hyphens', async () => {
      const hospital = makeHospital({ type: 'COSMETIC', nameEn: '  Hospital Name  ' });
      await service.syncToSupabase(hospital);

      const fromMock = mainSupabase.from as ReturnType<typeof vi.fn>;
      const upsertMock = fromMock.mock.results[0]!.value.upsert as ReturnType<typeof vi.fn>;
      const upsertData = upsertMock.mock.calls[0]![0] as { slug: string };
      expect(upsertData.slug).toBe('hospital-name');
    });
  });
});
