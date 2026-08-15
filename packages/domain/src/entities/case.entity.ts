import type { CaseStatus, CaseStage, RiskLevel } from '../enums/index.js';
import type { CaseAssignmentStatus, CaseTreatmentStage, AISummaryStatusType, CaseSourceChannel } from '../enums/index.js';
import type { CaseNumber } from '../value-objects/case-number.js';
import { ValidationError } from '@medical-crm/utils';
import { STATUS_TRANSITIONS } from '../state-machine/case-status-transitions.js';
import { STAGE_ORDER } from '../state-machine/case-stage-order.js';
import { ASSIGNMENT_STATUS_TRANSITIONS } from '../state-machine/assignment-status-transitions.js';
import { TREATMENT_STAGE_TRANSITIONS } from '../state-machine/treatment-stage-transitions.js';

export interface CaseProps {
  id: string;
  caseNumber: CaseNumber;
  patientId: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  assignedHospitalId: string | null;
  primaryDiagnosis: string | null;
  diagnosisCode: string | null;
  symptoms: string[] | null;
  medicalHistory: string | null;
  aiSummary: string | null;
  aiSummaryLanguage: string | null;
  riskLevel: RiskLevel | null;
  status: CaseStatus;
  stage: CaseStage;
  assignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignmentStatus: CaseAssignmentStatus;
  treatmentStage: CaseTreatmentStage | null;
  conditionSummary: string | null;
  listDiseaseLabel?: string | null;
  listCountryLabel?: string | null;
  structuredData: Record<string, unknown> | null;
  riskFlags: string[] | null;
  priority: string | null;
  lastEventAt: Date | null;
  aiSummaryStatus: AISummaryStatusType;
  questionCollectorTemplateId: string | null;
  /** Case Lifecycle Phase 1: how the case entered the system (DB default WEB_ONBOARDING) */
  sourceChannel?: CaseSourceChannel | null;
  /** Case Lifecycle Phase 1: admin who manually created the case (NULL for website flow) */
  createdByAdminId?: string | null;
}

export class Case {
  readonly id: string;
  readonly caseNumber: CaseNumber;
  patientId: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  assignedHospitalId: string | null;
  primaryDiagnosis: string | null;
  diagnosisCode: string | null;
  symptoms: string[] | null;
  medicalHistory: string | null;
  aiSummary: string | null;
  aiSummaryLanguage: string | null;
  riskLevel: RiskLevel | null;
  /** @deprecated Use assignmentStatus instead */
  status: CaseStatus;
  /** @deprecated Use treatmentStage instead */
  stage: CaseStage;
  assignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignmentStatus: CaseAssignmentStatus;
  treatmentStage: CaseTreatmentStage | null;
  conditionSummary: string | null;
  listDiseaseLabel: string | null;
  listCountryLabel: string | null;
  structuredData: Record<string, unknown> | null;
  riskFlags: string[] | null;
  priority: string | null;
  lastEventAt: Date | null;
  aiSummaryStatus: AISummaryStatusType;
  questionCollectorTemplateId: string | null;
  sourceChannel: CaseSourceChannel | null;
  createdByAdminId: string | null;

  constructor(props: CaseProps) {
    this.id = props.id;
    this.caseNumber = props.caseNumber;
    this.patientId = props.patientId;
    this.patientName = props.patientName;
    this.patientCountry = props.patientCountry;
    this.patientLanguage = props.patientLanguage;
    this.assignedHospitalId = props.assignedHospitalId;
    this.primaryDiagnosis = props.primaryDiagnosis;
    this.diagnosisCode = props.diagnosisCode;
    this.symptoms = props.symptoms;
    this.medicalHistory = props.medicalHistory;
    this.aiSummary = props.aiSummary;
    this.aiSummaryLanguage = props.aiSummaryLanguage;
    this.riskLevel = props.riskLevel;
    this.status = props.status;
    this.stage = props.stage;
    this.assignedAt = props.assignedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.assignmentStatus = props.assignmentStatus;
    this.treatmentStage = props.treatmentStage;
    this.conditionSummary = props.conditionSummary;
    this.listDiseaseLabel = props.listDiseaseLabel ?? null;
    this.listCountryLabel = props.listCountryLabel ?? null;
    this.structuredData = props.structuredData;
    this.riskFlags = props.riskFlags;
    this.priority = props.priority;
    this.lastEventAt = props.lastEventAt;
    this.aiSummaryStatus = props.aiSummaryStatus;
    this.questionCollectorTemplateId = props.questionCollectorTemplateId;
    this.sourceChannel = props.sourceChannel ?? null;
    this.createdByAdminId = props.createdByAdminId ?? null;
  }

  setAiAnalysis(summary: string, language: string, risk: RiskLevel): void {
    this.aiSummary = summary;
    this.aiSummaryLanguage = language;
    this.riskLevel = risk;
    this.updatedAt = new Date();
  }

  transitionStatus(to: CaseStatus): void {
    const allowed = STATUS_TRANSITIONS[this.status];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition case status from ${this.status} to ${to}`,
      );
    }
    this.status = to;
    this.updatedAt = new Date();
  }

  advanceStage(to: CaseStage): void {
    const currentIdx = STAGE_ORDER.indexOf(this.stage);
    const targetIdx = STAGE_ORDER.indexOf(to);
    if (targetIdx <= currentIdx) {
      throw new ValidationError(
        `Cannot move case stage backward from ${this.stage} to ${to}`,
      );
    }
    this.stage = to;
    this.updatedAt = new Date();
  }

  assign(hospitalId: string): void {
    this.assignedHospitalId = hospitalId;
    this.assignedAt = new Date();
    // Keep old field in sync for compat
    if (this.stage === 'PENDING_ASSIGNMENT') {
      this.stage = 'TRANSFERRED_TO_HOSPITAL';
    }
    // New field
    this.assignmentStatus = 'ASSIGNED';
    this.updatedAt = new Date();
  }

  transitionAssignmentStatus(to: CaseAssignmentStatus): void {
    const allowed = ASSIGNMENT_STATUS_TRANSITIONS[this.assignmentStatus];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition assignment status from ${this.assignmentStatus} to ${to}`,
      );
    }
    this.assignmentStatus = to;
    // When unassigning, clear the hospital reference so the case can be reassigned
    if (to === 'UNASSIGNED') {
      this.assignedHospitalId = null;
      this.assignedAt = null;
    }
    this.updatedAt = new Date();
  }

  advanceTreatmentStage(to: CaseTreatmentStage): void {
    if (!this.treatmentStage) {
      if (to !== 'CONFIRMED') {
        throw new ValidationError('Treatment stage must start at CONFIRMED');
      }
      this.treatmentStage = to;
      this.updatedAt = new Date();
      return;
    }
    const allowed = TREATMENT_STAGE_TRANSITIONS[this.treatmentStage];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition treatment stage from ${this.treatmentStage} to ${to}`,
      );
    }
    this.treatmentStage = to;
    this.updatedAt = new Date();
  }
}
