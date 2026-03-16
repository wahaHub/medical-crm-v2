import type { QuoteStatus } from '../enums/index.js';
import type { QuoteNumber } from '../value-objects/quote-number.js';
import { ValidationError } from '@medical-crm/utils';
import { QUOTE_STATUS_TRANSITIONS } from '../state-machine/quote-status-transitions.js';

export interface QuoteProps {
  id: string;
  caseId: string;
  hospitalId: string;
  quoteNumber: QuoteNumber;
  version: number;
  status: QuoteStatus;
  isDraft: boolean;
  totalAmount: string;  // decimal as string
  currency: string;
  validUntil: Date;
  treatmentPlan: string | null;
  lineItems: unknown | null;
  notes: string | null;
  sentAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Quote {
  readonly id: string;
  readonly caseId: string;
  readonly hospitalId: string;
  readonly quoteNumber: QuoteNumber;
  version: number;
  status: QuoteStatus;
  isDraft: boolean;
  totalAmount: string;
  currency: string;
  validUntil: Date;
  treatmentPlan: string | null;
  lineItems: unknown | null;
  notes: string | null;
  sentAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: QuoteProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.hospitalId = props.hospitalId;
    this.quoteNumber = props.quoteNumber;
    this.version = props.version;
    this.status = props.status;
    this.isDraft = props.isDraft;
    this.totalAmount = props.totalAmount;
    this.currency = props.currency;
    this.validUntil = props.validUntil;
    this.treatmentPlan = props.treatmentPlan;
    this.lineItems = props.lineItems;
    this.notes = props.notes;
    this.sentAt = props.sentAt;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  transitionStatus(to: QuoteStatus): void {
    const allowed = QUOTE_STATUS_TRANSITIONS[this.status];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition quote status from ${this.status} to ${to}`,
      );
    }
    this.status = to;
    this.updatedAt = new Date();
  }

  accept(): void {
    this.transitionStatus('ACCEPTED');
  }

  reject(): void {
    this.transitionStatus('REJECTED');
  }

  send(): void {
    if (!this.isDraft) throw new ValidationError('Quote is already sent');
    this.isDraft = false;
    this.sentAt = new Date();
    this.updatedAt = new Date();
  }

  resend(): void {
    // Can resend from REJECTED or EXPIRED
    this.transitionStatus('PENDING');
    // Note: version increment is handled by the repository's optimistic lock (SQL version + 1)
    this.updatedAt = new Date();
  }
}
