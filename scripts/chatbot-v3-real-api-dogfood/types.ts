export type DogfoodScenarioId = string;

export type BootstrapMode = 'blocked_expected' | 'chat_allowed' | 'bootstrap_failed';

export interface DogfoodConfig {
  baseUrl: string;
  site: string;
  runTimestamp: string;
  artifactSchemaVersion: 1;
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
  turns: TurnTranscript[];
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
