import type { CaseEvent } from '../entities/case-event.entity.js';

export interface CaseEventListOptions {
  eventType?: string;
  limit?: number;
  offset?: number;
}

export interface ICaseEventRepository {
  save(event: CaseEvent): Promise<CaseEvent>;
  findByCaseId(caseId: string, opts?: CaseEventListOptions): Promise<CaseEvent[]>;
  findVisibleByCaseId(caseId: string): Promise<CaseEvent[]>;
}
