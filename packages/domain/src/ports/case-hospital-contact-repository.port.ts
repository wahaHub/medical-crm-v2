import type { CaseHospitalContact } from '../entities/case-hospital-contact.entity.js';

export interface CHCListQuery {
  caseId?: string;
  hospitalId?: string;
  subStatus?: string;
  excludedPatientEmailDomains?: readonly string[];
  page: number;
  limit: number;
}

export interface ICHCRepository {
  findById(id: string, tx?: unknown): Promise<CaseHospitalContact | null>;
  findByCaseAndHospital(caseId: string, hospitalId: string, tx?: unknown): Promise<CaseHospitalContact | null>;
  findByCaseId(caseId: string, tx?: unknown): Promise<CaseHospitalContact[]>;
  findByHospitalId(hospitalId: string, query: CHCListQuery): Promise<{ data: CaseHospitalContact[]; total: number }>;
  save(entity: CaseHospitalContact, tx?: unknown): Promise<CaseHospitalContact>;
  rejectOthersByCaseExcept(caseId: string, excludeId: string, tx?: unknown): Promise<void>;
}
