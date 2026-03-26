export interface BatchTranslateRequest {
  fields: Record<string, unknown>;
  targetLanguages: string[];
}

export interface BatchTranslateResult {
  detectedLanguage: string;
  translations: Record<string, Record<string, unknown>>;
}

export interface IBatchTranslationService {
  translateBatch(request: BatchTranslateRequest): Promise<BatchTranslateResult>;
}
