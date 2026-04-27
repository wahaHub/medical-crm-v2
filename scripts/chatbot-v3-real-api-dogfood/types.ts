export type DogfoodScenarioId = string;

export type BootstrapMode = 'blocked_expected' | 'chat_allowed' | 'bootstrap_failed';

export interface DogfoodConfig {
  baseUrl: string;
  site: string;
  runTimestamp: string;
  artifactSchemaVersion: 1;
}

export type DogfoodFailureCategory =
  | 'environment'
  | 'bootstrap'
  | 'chat_transport'
  | 'chat_http'
  | 'control_plane'
  | 'agent_or_composer';

export type DogfoodFailurePhase =
  | 'preflight'
  | 'bootstrap'
  | 'chat'
  | 'evaluation'
  | 'reporting';

export interface DogfoodAttemptSummary {
  phase: 'bootstrap' | 'chat';
  turnIndex: number | null;
  attempt: number;
  durationMs: number;
  status?: number;
  transportErrorKind?: 'timeout' | 'transport_error';
  errorMessage?: string;
  retried: boolean;
}

export interface BootstrapResult {
  scenarioId: DogfoodScenarioId;
  baseUrl: string;
  site: string;
  bootstrapMode: BootstrapMode;
  patientSession: string | null;
  patientRestore: string | null;
  widgetChatTargetSessionId: string | null;
  redactedCookies: string[];
  timestamp: string;
}

export interface TurnTranscript {
  scenarioId: DogfoodScenarioId;
  turnIndex: number;
  requestUrl: string;
  requestAttempt: number;
  durationMs: number;
  transportErrorKind?: 'timeout' | 'transport_error';
  request: {
    method: string;
    path: string;
    body: unknown;
    headers: Record<string, string>;
  };
  response: {
    status: number;
    body: unknown;
    bodyText: string | null;
    headers: Record<string, string>;
  };
}

export interface ScenarioOutcome {
  scenarioId: DogfoodScenarioId;
  outcome: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';
  summary: string;
  failureCategory?: DogfoodFailureCategory;
  failedPhase?: DogfoodFailurePhase;
  usableForControlPlaneJudgment: boolean;
  bootstrapAttempts: DogfoodAttemptSummary[];
  chatAttempts: DogfoodAttemptSummary[];
  sessionId: string | null;
  turns: TurnTranscript[];
  notes: string[];
}

export interface RunRollup {
  outcome: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';
  scenarioOutcomes: ScenarioOutcome[];
}

export interface RunMetadata {
  artifactSchemaVersion: 1;
  runTimestamp: string;
  baseUrl: string;
  site: string;
  executedScenarioIds: DogfoodScenarioId[];
  redactedCookies: string[];
  gitCommit: string | null;
}
