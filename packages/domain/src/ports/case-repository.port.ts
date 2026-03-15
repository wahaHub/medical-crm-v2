import type { Case } from '../entities/case.entity.js';
import type { CaseNumber } from '../value-objects/case-number.js';
import type { CaseStatus, CaseStage } from '../enums/index.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface CaseListQuery {
  page: number;
  limit: number;
  status?: CaseStatus;
  stage?: CaseStage;
  hospitalId?: string;
  search?: string;
}

export interface CaseCountFilters {
  hospitalId?: string;
}

export interface CaseStats {
  total: number;
  unassigned: number;
  active: number;
  completed: number;
  cancelled: number;
}

export interface ICaseRepository {
  findById(id: string): Promise<Case | null>;
  findMany(query: CaseListQuery, hospitalId?: string): Promise<PaginatedResult<Case>>;
  save(entity: Case): Promise<Case>;
  nextCaseNumber(): Promise<CaseNumber>;
  countByFilters(filters: CaseCountFilters): Promise<CaseStats>;
}
