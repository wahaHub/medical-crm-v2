import type { Quote } from '../entities/quote.entity.js';
import type { PatientSiteAccessScope } from './patient-site-scope.port.js';

export interface QuoteListQuery {
  caseId?: string;
  hospitalId?: string;
  status?: string;
  page: number;
  limit: number;
  patientSiteScope?: PatientSiteAccessScope;
  excludedPatientEmailDomains?: string[];
}

export interface IQuoteRepository {
  findById(id: string, tx?: unknown): Promise<Quote | null>;
  findByCaseId(caseId: string, tx?: unknown): Promise<Quote[]>;
  findByHospitalId(hospitalId: string, query: QuoteListQuery): Promise<{ data: Quote[]; total: number }>;
  save(entity: Quote, tx?: unknown): Promise<Quote>;
  nextQuoteNumber(): Promise<string>;
  rejectPendingByCaseExcept(caseId: string, excludeQuoteId: string, tx?: unknown): Promise<void>;
}
