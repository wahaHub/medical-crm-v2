import type { IHospitalSyncService, Hospital } from '@medical-crm/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseHospitalSyncService implements IHospitalSyncService {
  constructor(
    private readonly mainSupabase: SupabaseClient,
    private readonly chinaSupabase: SupabaseClient,
  ) {}

  async syncToSupabase(hospital: Hospital): Promise<void> {
    console.log(`[HospitalSync] syncToSupabase called: id=${hospital.id}, type=${hospital.type}, name=${hospital.name}`);
    if (hospital.type === 'COSMETIC') {
      console.log(`[HospitalSync] Routing to Main Supabase (COSMETIC)`);
      await this.syncToMainSupabase(hospital);
    } else {
      console.log(`[HospitalSync] Routing to China Supabase (REGULAR)`);
      await this.syncToChinaSupabase(hospital);
    }
    console.log(`[HospitalSync] syncToSupabase completed for ${hospital.id}`);
  }

  private async syncToMainSupabase(hospital: Hospital): Promise<void> {
    await this.upsertHospital(
      this.mainSupabase,
      {
        id: hospital.id,
        name: hospital.name,
        is_active: hospital.status === 'ACTIVE',
        photos: [],
        payment_methods: [],
        highlights: [],
        crm_metadata: null,
        sort_order: 0,
        updated_at: hospital.updatedAt.toISOString(),
      },
      hospital,
      'main',
    );
  }

  private async syncToChinaSupabase(hospital: Hospital): Promise<void> {
    const payload = {
      id: hospital.id,
      city: hospital.city ?? '',
      address: hospital.address,
      is_active: hospital.status === 'ACTIVE',
      status: hospital.status === 'ACTIVE' ? 'approved' : 'pending',
      updated_at: hospital.updatedAt.toISOString(),
    };
    console.log(`[HospitalSync] China payload:`, JSON.stringify(payload));
    await this.upsertHospital(this.chinaSupabase, payload, hospital, 'China');
  }

  private async upsertHospital(
    supabase: SupabaseClient,
    payload: Record<string, unknown>,
    hospital: Hospital,
    target: 'main' | 'China',
  ): Promise<void> {
    const initialSlug = this.buildSlug(hospital);
    let result = await this.upsertWithSlug(supabase, payload, initialSlug);

    if (result.error && this.isSlugConflict(result.error)) {
      const retrySlug = this.buildSlug(hospital, true);
      if (retrySlug !== initialSlug) {
        result = await this.upsertWithSlug(supabase, payload, retrySlug);
      }
    }

    if (result.error) {
      console.error(`[HospitalSync] Upsert FAILED for ${hospital.id} to ${target}: ${result.error.message}`);
      throw new Error(`Failed to sync hospital ${hospital.id} to ${target} Supabase: ${result.error.message}`);
    }
    console.log(`[HospitalSync] Upsert succeeded for ${hospital.id} to ${target}`);
  }

  private async upsertWithSlug(
    supabase: SupabaseClient,
    payload: Record<string, unknown>,
    slug: string,
  ): Promise<{ error: { message: string } | null }> {
    return await supabase
      .from('hospitals')
      .upsert(
        {
          ...payload,
          slug,
        },
        { onConflict: 'id' },
      );
  }

  private buildSlug(hospital: Hospital, forceSuffix = false): string {
    const baseSlug = this.toSlug(hospital.nameEn || hospital.name);
    const suffix = this.slugSuffix(hospital.id);

    if (!baseSlug) {
      return `hospital-${suffix}`;
    }

    return forceSuffix ? `${baseSlug}-${suffix}` : baseSlug;
  }

  private slugSuffix(value: string): string {
    const normalized = this.toSlug(value).replace(/-/g, '');
    return normalized.slice(0, 8) || 'record';
  }

  private isSlugConflict(error: { message: string }): boolean {
    return error.message.includes('hospitals_slug_key');
  }

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
