export interface QuoteDTO {
  id: string;
  caseId: string;
  hospitalId: string;
  hospitalName?: string;
  quoteNumber: string;
  version: number;
  status: string;
  isDraft: boolean;
  totalAmount: string;
  currency: string;
  validUntil: string;
  treatmentPlan: string | null;
  lineItems: unknown;
  notes: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
