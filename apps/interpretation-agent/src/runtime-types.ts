export interface DispatchMetadata {
  schema: 'medora.interpretation.dispatch.v1';
  /** Hosted dispatch correlation; absent only for the self-hosted runner. */
  dispatchCorrelationId?: string;
  jobId: string;
  roomName: string;
  roomGeneration: number;
  interpretationGeneration: number;
  executionVersion: number;
  agentIdentity: string;
}

export interface AuthorizedTrack {
  id: string;
  participantIdentity: string;
  trackSid: string;
  sourceLanguage: 'zh' | 'en';
  targetLanguage: 'zh' | 'en';
  languageVersion: number;
  consentVersion: number;
  authorizationRevision: number;
  authorized: boolean;
}

export interface AuthorizationResponse {
  success: true;
  authorized: true;
  requestSeq: number;
  nonce: string;
  jobId: string;
  roomName: string;
  roomGeneration: number;
  interpretationGeneration: number;
  executionVersion: number;
  authorizationRevision: number;
  tracks: AuthorizedTrack[];
}
