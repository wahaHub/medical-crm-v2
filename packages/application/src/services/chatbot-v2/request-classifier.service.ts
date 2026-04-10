import type { ChatResourceType } from '@medical-crm/domain';
import type {
  RequestClassificationInput,
  RequestClassificationResult,
} from './types.js';

export class RequestClassifierService {
  classify(input: RequestClassificationInput): RequestClassificationResult {
    const bridged = mapLegacyResolvedIntent(input.resolvedIntent);
    if (bridged) {
      return bridged;
    }

    const message = normalize(input.userMessage);
    const resourceTypes = detectResourceTypes(message);

    if (includesAny(message, HUMAN_HELP_PATTERNS)) {
      return {
        requestClass: 'human_help_request',
        targetResourceTypes: ['HUMAN_HANDOFF'],
      };
    }

    if (includesAny(message, PROCESS_PATTERNS)) {
      return {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
      };
    }

    if (resourceTypes.length > 0 && includesAny(message, STATUS_PATTERNS)) {
      return {
        requestClass: 'resource_status_question',
        targetResourceTypes: resourceTypes,
      };
    }

    if (includesAny(message, PROGRESSION_PATTERNS)) {
      return {
        requestClass: 'progression_request',
        targetResourceTypes: [],
      };
    }

    if (resourceTypes.length > 0) {
      return {
        requestClass: 'resource_request',
        targetResourceTypes: resourceTypes,
      };
    }

    return {
      requestClass: 'faq',
      targetResourceTypes: [],
    };
  }
}

const HUMAN_HELP_PATTERNS = [
  'human',
  'person',
  'advisor',
  'agent',
  'staff',
  'real person',
];

const PROCESS_PATTERNS = [
  'how the process works',
  'how this process works',
  'explain the process',
  'process works',
  'service process',
  'how does it work',
];

const STATUS_PATTERNS = [
  'status',
  'sent yet',
  'progress',
  'update',
  'has my',
];

const PROGRESSION_PATTERNS = [
  'next step',
  'what should i do next',
  'what is the next step',
  'ready to continue',
  'ready to move forward',
  'move forward',
  'continue',
  'proceed',
  'get started',
  'start now',
];

function mapLegacyResolvedIntent(resolvedIntent: string | undefined): RequestClassificationResult | null {
  switch (resolvedIntent) {
    case 'REQUEST_HUMAN_HANDOFF':
      return {
        requestClass: 'human_help_request',
        targetResourceTypes: ['HUMAN_HANDOFF'],
      };
    case 'ASK_MEDICAL_TRAVEL_PROCESS':
    case 'ASK_CONSULT_PROCESS':
      return {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
      };
    case 'REQUEST_DOC_UPLOAD':
    case 'ACCEPT_DOC_UPLOAD':
      return {
        requestClass: 'resource_request',
        targetResourceTypes: ['MEDICAL_DOC_UPLOAD'],
      };
    default:
      return null;
  }
}

function detectResourceTypes(message: string): ChatResourceType[] {
  const resourceTypes = new Set<ChatResourceType>();

  if (includesAny(message, ['questionnaire', 'medical form', 'intake form', 'form'])) {
    resourceTypes.add('QUESTIONNAIRE');
  }

  if (includesAny(message, ['document', 'documents', 'upload', 'medical record', 'records', 'report', 'reports'])) {
    resourceTypes.add('MEDICAL_DOC_UPLOAD');
  }

  if (includesAny(message, ['medical invitation', 'invitation'])) {
    resourceTypes.add('MEDICAL_INVITATION_STATUS');
  }

  if (includesAny(message, ['consult', 'consultation', 'booking', 'appointment'])) {
    resourceTypes.add('ONLINE_CONSULT_BOOKING');
  }

  if (includesAny(message, ['package'])) {
    resourceTypes.add('PACKAGE_RECOMMENDATION');
  }

  if (
    includesAny(message, [
      'hospital recommendation',
      'doctor recommendation',
      'recommendation',
    ])
    || (includesAny(message, ['hospital']) && !includesAny(message, ['invitation']))
  ) {
    resourceTypes.add('HOSPITAL_RECOMMENDATION');
  }

  return [...resourceTypes];
}

function includesAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => includesPattern(message, pattern));
}

function includesPattern(message: string, pattern: string): boolean {
  const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedPattern}\\b`).test(message);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
