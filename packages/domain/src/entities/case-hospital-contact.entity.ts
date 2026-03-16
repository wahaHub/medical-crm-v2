import type { CHCSubStatus } from '../enums/index.js';
import { ValidationError } from '@medical-crm/utils';
import { CHC_SUB_STATUS_TRANSITIONS } from '../state-machine/chc-sub-status-transitions.js';

export interface CaseHospitalContactProps {
  id: string;
  caseId: string;
  hospitalId: string;
  subStatus: CHCSubStatus;
  selectedByPatientAt: Date | null;
  distributedAt: Date | null;
  firstReplyAt: Date | null;
  quoteId: string | null;
  patientViewedQuoteAt: Date | null;
  patientAcceptedAt: Date | null;
  patientRejectedAt: Date | null;
  reminderSentAt: Date | null;
  removedAt: Date | null;
  removedReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class CaseHospitalContact {
  readonly id: string;
  readonly caseId: string;
  readonly hospitalId: string;
  subStatus: CHCSubStatus;
  selectedByPatientAt: Date | null;
  distributedAt: Date | null;
  firstReplyAt: Date | null;
  quoteId: string | null;
  patientViewedQuoteAt: Date | null;
  patientAcceptedAt: Date | null;
  patientRejectedAt: Date | null;
  reminderSentAt: Date | null;
  removedAt: Date | null;
  removedReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: CaseHospitalContactProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.hospitalId = props.hospitalId;
    this.subStatus = props.subStatus;
    this.selectedByPatientAt = props.selectedByPatientAt;
    this.distributedAt = props.distributedAt;
    this.firstReplyAt = props.firstReplyAt;
    this.quoteId = props.quoteId;
    this.patientViewedQuoteAt = props.patientViewedQuoteAt;
    this.patientAcceptedAt = props.patientAcceptedAt;
    this.patientRejectedAt = props.patientRejectedAt;
    this.reminderSentAt = props.reminderSentAt;
    this.removedAt = props.removedAt;
    this.removedReason = props.removedReason;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  transitionSubStatus(to: CHCSubStatus): void {
    const allowed = CHC_SUB_STATUS_TRANSITIONS[this.subStatus];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition CHC sub-status from ${this.subStatus} to ${to}`,
      );
    }
    this.subStatus = to;
    this.updatedAt = new Date();
  }

  remove(reason?: string): void {
    this.transitionSubStatus('REMOVED');
    this.removedAt = new Date();
    this.removedReason = reason ?? null;
  }
}
