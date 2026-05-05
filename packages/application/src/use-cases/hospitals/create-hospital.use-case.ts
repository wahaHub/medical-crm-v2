import { generateId, ForbiddenError } from '@medical-crm/utils';
import { Hospital } from '@medical-crm/domain';
import type { HospitalSite, IHospitalManagementRepository, IHospitalSyncService, HospitalType } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export interface CreateHospitalInput {
  name: string;
  type: HospitalType;
  site?: HospitalSite;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  description?: string;
  specialties: string[];
}

export class CreateHospitalUseCase {
  constructor(
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly syncService: IHospitalSyncService,
  ) {}

  async execute(input: CreateHospitalInput, actor: Actor): Promise<HospitalDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can create hospitals');
    }

    const now = new Date();
    const entity = new Hospital({
      id: generateId(),
      name: input.name,
      nameEn: '',
      address: input.address ?? null,
      city: input.city ?? null,
      phone: input.contactPhone ?? null,
      email: input.contactEmail,
      description: input.description ?? null,
      logoUrl: null,
      specialties: input.specialties,
      status: 'PENDING',
      type: input.type,
      site: input.site ?? (input.type === 'COSMETIC' ? 'cosmetic' : 'china'),
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.hospitalRepo.save(entity);
    console.log(`[CreateHospital] Saved hospital ${saved.id} (type=${saved.type}), syncing to Supabase...`);
    try {
      await this.syncService.syncToSupabase(saved);
      console.log(`[CreateHospital] Sync to Supabase succeeded for hospital ${saved.id}`);
    } catch (syncErr) {
      console.error(`[CreateHospital] Sync to Supabase FAILED for hospital ${saved.id}:`, syncErr);
      // Re-throw so the caller knows sync failed
      throw syncErr;
    }
    return toHospitalDTO(saved);
  }
}
