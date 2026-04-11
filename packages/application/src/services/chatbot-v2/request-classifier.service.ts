import type { ChatResourceType } from '@medical-crm/domain';
import type {
  RequestClassificationInput,
  RequestClassificationResult,
} from './types.js';

export class RequestClassifierService {
  classify(input: RequestClassificationInput): RequestClassificationResult {
    const userMessage = input.userMessage
      ?? input.recentMessages[input.recentMessages.length - 1]?.content
      ?? '';
    const bridged = mapLegacyResolvedIntent(input.resolvedIntent);
    if (bridged) {
      return bridged;
    }

    const message = normalize(userMessage);
    const resourceTypes = detectResourceTypes(message);

    if (includesAny(message, HUMAN_HELP_PATTERNS)) {
      return {
        requestClass: 'human_help_request',
        targetResourceTypes: ['HUMAN_HANDOFF'],
        includeProgressionFollowUp: false,
      };
    }

    if (includesAny(message, PROCESS_PATTERNS)) {
      return {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      };
    }

    const statusResourceTypes = resourceTypes.filter((resourceType) => QUERY_RESOURCE_TYPES.includes(resourceType));
    if (statusResourceTypes.length > 0 && includesAny(message, STATUS_PATTERNS)) {
      return {
        requestClass: 'resource_status_question',
        targetResourceTypes: statusResourceTypes,
        includeProgressionFollowUp: false,
      };
    }

    if (includesAny(message, PROGRESSION_PATTERNS)) {
      return {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      };
    }

    if (resourceTypes.length > 0) {
      return {
        requestClass: 'resource_request',
        targetResourceTypes: resourceTypes,
        includeProgressionFollowUp: false,
      };
    }

    return {
      requestClass: 'faq',
      targetResourceTypes: [],
      includeProgressionFollowUp: false,
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
  '人工',
  '真人',
  '客服',
  '顾问',
];

const PROCESS_PATTERNS = [
  'how the process works',
  'how this process works',
  'explain the process',
  'process works',
  'service process',
  'how does it work',
  '流程',
  '怎么进行',
  '怎么操作',
  '怎么安排',
];

const STATUS_PATTERNS = [
  'status',
  'sent yet',
  'progress',
  'update',
  'has my',
  '状态',
  '进度',
  '有没有收到',
  '查看一下',
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
  '下一步',
  '继续',
  '继续推进',
  '开始下一步',
  '现在开始',
  '开始流程',
  '开始办理',
];

const QUERY_RESOURCE_TYPES: ChatResourceType[] = ['MEDICAL_INVITATION_STATUS'];

function mapLegacyResolvedIntent(resolvedIntent: string | undefined): RequestClassificationResult | null {
  switch (resolvedIntent) {
    case 'REQUEST_HUMAN_HANDOFF':
      return {
        requestClass: 'human_help_request',
        targetResourceTypes: ['HUMAN_HANDOFF'],
        includeProgressionFollowUp: false,
      };
    case 'ASK_MEDICAL_TRAVEL_PROCESS':
    case 'ASK_CONSULT_PROCESS':
      return {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      };
    case 'REQUEST_DOC_UPLOAD':
    case 'ACCEPT_DOC_UPLOAD':
      return {
        requestClass: 'resource_request',
        targetResourceTypes: ['MEDICAL_DOC_UPLOAD'],
        includeProgressionFollowUp: false,
      };
    default:
      return null;
  }
}

function detectResourceTypes(message: string): ChatResourceType[] {
  const resourceTypes = new Set<ChatResourceType>();

  if (includesAny(message, ['questionnaire', 'medical form', 'intake form', 'form', '问卷', '表格'])) {
    resourceTypes.add('QUESTIONNAIRE');
  }

  if (includesAny(message, ['document', 'documents', 'upload', 'medical record', 'records', 'report', 'reports', '病历', '资料', '上传', '报告', '检查'])) {
    resourceTypes.add('MEDICAL_DOC_UPLOAD');
  }

  if (includesAny(message, ['medical invitation', 'invitation', '邀请函'])) {
    resourceTypes.add('MEDICAL_INVITATION_STATUS');
  }

  if (includesAny(message, ['consult', 'consultation', 'booking', 'appointment', '问诊', '预约'])) {
    resourceTypes.add('ONLINE_CONSULT_BOOKING');
  }

  if (includesAny(message, ['package', '套餐'])) {
    resourceTypes.add('PACKAGE_RECOMMENDATION');
  }

  if (
    includesAny(message, [
      'hospital recommendation',
      'hospital recommendations',
      'doctor recommendation',
      'doctor recommendations',
      'recommendation',
      '医院推荐',
      '医生推荐',
      '推荐',
    ])
    || (includesAny(message, ['hospital', 'hospitals', 'doctor', 'doctors', '医院', '医生']) && !includesAny(message, ['invitation', '邀请函']))
  ) {
    resourceTypes.add('HOSPITAL_RECOMMENDATION');
  }

  return [...resourceTypes];
}

function includesAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => includesPattern(message, pattern));
}

function includesPattern(message: string, pattern: string): boolean {
  if (/[^\x00-\x7F]/.test(pattern)) {
    return message.includes(pattern);
  }

  const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedPattern}\\b`).test(message);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
