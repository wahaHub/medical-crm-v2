export interface AiUserProfileProps {
  id: string;
  patientId: string | null;
  anonymousKey: string | null;
  conditionOrGoal?: string | null;
  conditionCategory?: string | null;
  preferredDestination?: string[];
  preferredLanguage?: string | null;
  budgetBand?: string | null;
  urgencyLevel?: string | null;
  existingReportsStatus?: string;
  objectionTags?: string[];
  leadStage?: string;
  nextBestAction?: string | null;
  memorySummary?: string;
  sourceConfidenceMap?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class AiUserProfile {
  readonly id: string;
  patientId: string | null;
  anonymousKey: string | null;
  conditionOrGoal: string | null;
  conditionCategory: string | null;
  preferredDestination: string[];
  preferredLanguage: string | null;
  budgetBand: string | null;
  urgencyLevel: string | null;
  existingReportsStatus: string;
  objectionTags: string[];
  leadStage: string;
  nextBestAction: string | null;
  memorySummary: string;
  sourceConfidenceMap: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: AiUserProfileProps) {
    this.id = props.id;
    this.patientId = props.patientId;
    this.anonymousKey = props.anonymousKey;
    this.conditionOrGoal = props.conditionOrGoal ?? null;
    this.conditionCategory = props.conditionCategory ?? null;
    this.preferredDestination = props.preferredDestination ?? [];
    this.preferredLanguage = props.preferredLanguage ?? null;
    this.budgetBand = props.budgetBand ?? null;
    this.urgencyLevel = props.urgencyLevel ?? null;
    this.existingReportsStatus = props.existingReportsStatus ?? 'none';
    this.objectionTags = props.objectionTags ?? [];
    this.leadStage = props.leadStage ?? 'browsing';
    this.nextBestAction = props.nextBestAction ?? null;
    this.memorySummary = props.memorySummary ?? '';
    this.sourceConfidenceMap = props.sourceConfidenceMap ?? {};
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
