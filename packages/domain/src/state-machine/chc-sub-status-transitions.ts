import type { CHCSubStatus } from '../enums/index.js';

export const CHC_SUB_STATUS_TRANSITIONS: Record<CHCSubStatus, CHCSubStatus[]> = {
  DISTRIBUTED: ['NEED_INFO', 'QUOTED', 'REMOVED'],
  NEED_INFO: ['QUOTED', 'REMOVED'],
  QUOTED: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'REMOVED'],
  ACCEPTED: [],   // terminal
  REJECTED: ['QUOTED'],  // via ResendQuote
  EXPIRED: ['QUOTED'],   // via ResendQuote
  REMOVED: [],    // terminal
};
