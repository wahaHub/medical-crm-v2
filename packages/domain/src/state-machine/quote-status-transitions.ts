import type { QuoteStatus } from '../enums/index.js';

export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],     // terminal
  REJECTED: ['PENDING'],  // via ResendQuote
  EXPIRED: ['PENDING'],   // via ResendQuote
};
