import type { Hospital } from '@medical-crm/domain';
import type { HospitalDTO } from '../dtos/hospital.dto.js';

export function toHospitalDTO(entity: Hospital): HospitalDTO {
  return {
    id: entity.id,
    name: entity.name,
    nameEn: entity.nameEn,
    address: entity.address,
    phone: entity.phone,
    email: entity.email,
    description: entity.description,
    logoUrl: entity.logoUrl,
    specialties: entity.specialties,
    status: entity.status,
    type: entity.type,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
