// Enums
export type {
  CaseStatus, CaseStage, RiskLevel, DocumentType,
  Sensitivity, DocumentStatus, ProgressType,
} from './enums/index.js';

// State machine
export { STATUS_TRANSITIONS } from './state-machine/case-status-transitions.js';
export { STAGE_ORDER } from './state-machine/case-stage-order.js';

// Value objects
export { CaseNumber } from './value-objects/case-number.js';

// Entities
export { Case } from './entities/case.entity.js';
export type { CaseProps } from './entities/case.entity.js';
