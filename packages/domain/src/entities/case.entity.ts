import type { CaseStatus, CaseStage, RiskLevel } from '../enums/index.js';
import type { CaseNumber } from '../value-objects/case-number.js';
import { ValidationError } from '@medical-crm/utils';
import { STATUS_TRANSITIONS } from '../state-machine/case-status-transitions.js';
import { STAGE_ORDER } from '../state-machine/case-stage-order.js';

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
  status: CaseStatus;
  stage: CaseStage;
  assignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

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
    if (this.stage === 'PENDING_ASSIGNMENT') {
      this.stage = 'TRANSFERRED_TO_HOSPITAL';
    }
    this.updatedAt = new Date();
  }
}
