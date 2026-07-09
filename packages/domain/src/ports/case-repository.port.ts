import type { Case } from '../entities/case.entity.js';
import type { CaseNumber } from '../value-objects/case-number.js';
import type { CaseStatus, CaseStage, CaseAssignmentStatus, CaseTreatmentStage } from '../enums/index.js';
import type { PatientSiteAccessScope } from './patient-site-scope.port.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface CaseListQuery {
  page: number;
  limit: number;
  status?: CaseStatus;      // deprecated
  stage?: CaseStage;         // deprecated
  assignmentStatus?: CaseAssignmentStatus;
  treatmentStage?: CaseTreatmentStage;
  hospitalId?: string;
  search?: string;
  patientSiteScope?: PatientSiteAccessScope;
  excludedPatientEmailDomains?: string[];
}

export interface CaseCountFilters {
  hospitalId?: string;
  patientSiteScope?: PatientSiteAccessScope;
  excludedPatientEmailDomains?: string[];
}

export interface CaseStats {
  total: number;
  unassigned: number;
  assigned: number;
  inTreatment: number;
  postTreatment: number;
  completed: number;
  followUp: number;
}

export interface ICaseRepository {
  findById(id: string, tx?: unknown): Promise<Case | null>;
  findMany(query: CaseListQuery, hospitalId?: string): Promise<PaginatedResult<Case>>;
  findByPatientId(patientId: string): Promise<Case[]>;
  save(entity: Case, tx?: unknown): Promise<Case>;
  nextCaseNumber(): Promise<CaseNumber>;
  countByFilters(filters: CaseCountFilters): Promise<CaseStats>;
}
