import type { Consultation } from '../entities/consultation.entity.js';
import type { ConsultationStatus } from '../enums/index.js';
import type { CursorPaginatedResult } from '@medical-crm/utils';

export interface ConsultationListQuery {
  cursor?: { scheduledAt: string; id: string };
  limit: number;
  hospitalId?: string;
  caseId?: string;
  status?: ConsultationStatus;
}

export interface ConsultationCountFilters {
  hospitalId?: string;
}

export interface ConsultationStats {
  total: number;
  scheduled: number;
  completed: number;
  todayCount: number;
  needsTranslation: number;
}

export interface IConsultationRepository {
  findById(id: string): Promise<Consultation | null>;
  findMany(query: ConsultationListQuery): Promise<CursorPaginatedResult<Consultation>>;
  findByCaseId(caseId: string): Promise<Consultation[]>;
  save(entity: Consultation): Promise<Consultation>;
  countByFilters(filters: ConsultationCountFilters): Promise<ConsultationStats>;
}
