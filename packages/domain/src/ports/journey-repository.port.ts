import type { CaseJourney } from '../entities/case-journey.entity.js';
import type { JourneyMilestone } from '../entities/journey-milestone.entity.js';

export interface IJourneyRepository {
  // Journey
  findJourneyByCaseId(caseId: string, tx?: unknown): Promise<CaseJourney | null>;
  saveJourney(entity: CaseJourney, tx?: unknown): Promise<CaseJourney>;

  // Milestones
  findMilestoneById(id: string, tx?: unknown): Promise<JourneyMilestone | null>;
  findMilestonesByCaseId(caseId: string, options?: { visibleOnly?: boolean }): Promise<JourneyMilestone[]>;
  saveMilestone(entity: JourneyMilestone, tx?: unknown): Promise<JourneyMilestone>;
  deleteMilestone(id: string): Promise<void>;
}
