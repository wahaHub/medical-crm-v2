import type { Quote } from '@medical-crm/domain';
import type { QuoteDTO } from '../dtos/quote.dto.js';

export function toQuoteDTO(entity: Quote, hospitalName?: string): QuoteDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    hospitalId: entity.hospitalId,
    hospitalName,
    quoteNumber: entity.quoteNumber.value,
    version: entity.version,
    status: entity.status,
    isDraft: entity.isDraft,
    totalAmount: entity.totalAmount,
    currency: entity.currency,
    validUntil: entity.validUntil.toISOString(),
    treatmentPlan: entity.treatmentPlan,
    lineItems: entity.lineItems,
    notes: entity.notes,
    sentAt: entity.sentAt?.toISOString() ?? null,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
