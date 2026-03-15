import type { IHospitalSyncService, Hospital } from '@medical-crm/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseHospitalSyncService implements IHospitalSyncService {
  constructor(
    private readonly mainSupabase: SupabaseClient,
    private readonly chinaSupabase: SupabaseClient,
  ) {}

  async syncToSupabase(hospital: Hospital): Promise<void> {
    if (hospital.type === 'COSMETIC') {
      await this.syncToMainSupabase(hospital);
    } else {
      await this.syncToChinaSupabase(hospital);
    }
  }

  private async syncToMainSupabase(hospital: Hospital): Promise<void> {
    const slug = this.toSlug(hospital.nameEn);

    const { error } = await this.mainSupabase
      .from('hospitals')
      .upsert(
        {
          id: hospital.id,
          slug,
          name: hospital.name,
          is_active: hospital.status === 'ACTIVE',
          photos: [],
          payment_methods: [],
          highlights: [],
          crm_metadata: null,
          sort_order: 0,
          updated_at: hospital.updatedAt.toISOString(),
        },
        { onConflict: 'id' },
      );

    if (error) {
      throw new Error(`Failed to sync hospital ${hospital.id} to main Supabase: ${error.message}`);
    }
  }

  private async syncToChinaSupabase(hospital: Hospital): Promise<void> {
    const slug = this.toSlug(hospital.nameEn);

    const { error } = await this.chinaSupabase
      .from('hospitals')
      .upsert(
        {
          id: hospital.id,
          slug,
          city: hospital.address ?? '',
          address: hospital.address,
          is_active: hospital.status === 'ACTIVE',
          status: hospital.status === 'ACTIVE' ? 'approved' : 'pending',
          updated_at: hospital.updatedAt.toISOString(),
        },
        { onConflict: 'id' },
      );

    if (error) {
      throw new Error(`Failed to sync hospital ${hospital.id} to China Supabase: ${error.message}`);
    }
  }

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
