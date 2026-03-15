import type { CaseProgress } from '../entities/case-progress.entity.js';

export interface ICaseProgressRepository {
  findByCaseId(caseId: string): Promise<CaseProgress[]>;
  save(progress: CaseProgress): Promise<CaseProgress>;
}
