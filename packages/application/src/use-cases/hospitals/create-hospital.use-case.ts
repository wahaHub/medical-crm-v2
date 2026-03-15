import { generateId, ForbiddenError } from '@medical-crm/utils';
import { Hospital } from '@medical-crm/domain';
import type { IHospitalManagementRepository, IHospitalSyncService, HospitalType } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export interface CreateHospitalInput {
  name: string;
  type: HospitalType;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  description?: string;
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
      phone: input.contactPhone ?? null,
      email: input.contactEmail,
      description: input.description ?? null,
      logoUrl: null,
      specialties: null,
      status: 'PENDING',
      type: input.type,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.hospitalRepo.save(entity);
    await this.syncService.syncToSupabase(saved);
    return toHospitalDTO(saved);
  }
}
