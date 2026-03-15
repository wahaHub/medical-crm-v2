import type { Hospital } from '../entities/hospital.entity.js';

export interface IHospitalSyncService {
  syncToSupabase(hospital: Hospital): Promise<void>;
}
