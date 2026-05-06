import type { Hospital } from '../entities/hospital.entity.js';
import type { HospitalSite, HospitalStatus, HospitalType } from '../enums/index.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface HospitalListQuery {
  page: number;
  limit: number;
  status?: HospitalStatus;
  type?: HospitalType;
  site?: HospitalSite;
  search?: string;
}

export interface IHospitalManagementRepository {
  findFullById(id: string): Promise<Hospital | null>;
  findMany(query: HospitalListQuery): Promise<PaginatedResult<Hospital>>;
  save(entity: Hospital): Promise<Hospital>;
  updateStatus(id: string, status: HospitalStatus): Promise<Hospital>;
}
