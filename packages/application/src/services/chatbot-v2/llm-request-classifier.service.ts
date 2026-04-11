import {
  ChatbotV2ClassifierInputSchema,
  ChatbotV2ClassifierResultSchema,
} from '@medical-crm/validation';
import type {
  ChatbotV2ClassifierInput,
  RequestClassificationResult,
} from './types.js';

export interface LlmRequestClassifierGateway {
  classify(input: ChatbotV2ClassifierInput): Promise<unknown>;
}

export class LlmRequestClassifierService {
  constructor(private readonly gateway: LlmRequestClassifierGateway) {}

  async classify(input: ChatbotV2ClassifierInput): Promise<RequestClassificationResult> {
    const normalizedInput = ChatbotV2ClassifierInputSchema.parse(input);
    const rawResult = await this.gateway.classify(normalizedInput);
    return parseClassifierResult(rawResult);
  }
}

export function parseClassifierResult(rawResult: unknown): RequestClassificationResult {
  const direct = ChatbotV2ClassifierResultSchema.safeParse(rawResult);
  if (direct.success) {
    return direct.data;
  }

  const record = asRecord(rawResult);
  const answer = record['answer'];
  if (typeof answer === 'string' && answer.trim().length > 0) {
    const parsedAnswer = tryParseJson(answer);
    const answerResult = ChatbotV2ClassifierResultSchema.safeParse(parsedAnswer);
    if (answerResult.success) {
      return answerResult.data;
    }
  }

  const metadata = asRecord(record['metadata']);
  const classifierResult = metadata['classifierResult'] ?? metadata['classifier_result'];
  const metadataResult = ChatbotV2ClassifierResultSchema.safeParse(classifierResult);
  if (metadataResult.success) {
    return metadataResult.data;
  }

  throw new Error('Invalid classifier result payload');
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
