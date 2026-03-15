import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { IHospitalManagementRepository, IHospitalSyncService } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export interface UpdateHospitalInput {
  id: string;
  name?: string;
  nameEn?: string;
  address?: string;
  phone?: string;
  email?: string;
  description?: string;
  logoUrl?: string;
  specialties?: string[];
}

export class UpdateHospitalUseCase {
  constructor(
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly syncService: IHospitalSyncService,
  ) {}

  async execute(input: UpdateHospitalInput, actor: Actor): Promise<HospitalDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can update hospitals');
    }

    const entity = await this.hospitalRepo.findFullById(input.id);
    if (!entity) {
      throw new NotFoundError(`Hospital ${input.id} not found`);
    }

    if (input.name !== undefined) entity.name = input.name;
    if (input.nameEn !== undefined) entity.nameEn = input.nameEn;
    if (input.address !== undefined) entity.address = input.address;
    if (input.phone !== undefined) entity.phone = input.phone;
    if (input.email !== undefined) entity.email = input.email;
    if (input.description !== undefined) entity.description = input.description;
    if (input.logoUrl !== undefined) entity.logoUrl = input.logoUrl;
    if (input.specialties !== undefined) entity.specialties = input.specialties;
    entity.updatedAt = new Date();

    const saved = await this.hospitalRepo.save(entity);
    await this.syncService.syncToSupabase(saved);
    return toHospitalDTO(saved);
  }
}
