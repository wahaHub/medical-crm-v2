import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { writeDogfoodArtifacts } from '../chatbot-v3-real-api-dogfood/reporting.ts';
import type { BootstrapSuccessResult } from '../chatbot-v3-real-api-dogfood/bootstrap.ts';
import type { DogfoodFailureCategory, DogfoodFailurePhase, RunRollup, ScenarioOutcome } from '../chatbot-v3-real-api-dogfood/types.ts';

function makeBootstrapResult(): BootstrapSuccessResult {
  return {
    scenarioId: 'allowed_after_patient_session',
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    timestamp: '2026-04-18T14-05-09Z',
    bootstrapMode: 'chat_allowed',
    patientSession: 'session-cookie-123',
    patientRestore: 'restore-cookie-123',
    widgetChatTargetSessionId: 'widget-chat-session-123',
    redactedCookies: ['patient_restore=REDACTED', 'patient_session=REDACTED'],
    attempts: [
      {
        phase: 'bootstrap',
        turnIndex: null,
        attempt: 1,
        durationMs: 321,
        status: 200,
        retried: false,
      },
    ],
  };
}

function makeScenarioOutcome(overrides: Partial<ScenarioOutcome> = {}): ScenarioOutcome {
  return {
    scenarioId: 'allowed_after_patient_session',
    outcome: 'PASS',
    summary:
      'all four axes passed; patient_session=session-cookie-123; patient_restore=restore-cookie-123; chatbot_session_secret=chatbot-secret-abc; restore_token=restore-token-xyz',
    usableForControlPlaneJudgment: true,
    bootstrapAttempts: [],
    chatAttempts: [
      {
        phase: 'chat',
        turnIndex: 0,
        attempt: 1,
        durationMs: 456,
        status: 200,
        retried: false,
      },
    ],
    sessionId: 'widget-chat-session-123',
    turns: [
      {
        scenarioId: 'allowed_after_patient_session',
        turnIndex: 0,
        requestUrl: 'https://crm.example.com/api/v3/chatbot/chat',
        requestAttempt: 1,
        durationMs: 456,
        request: {
          method: 'POST',
          path: '/api/v3/chatbot/chat',
          body: { sessionId: 'widget-chat-session-123', message: 'Hello' },
          headers: {
            cookie: 'patient_session=session-cookie-123; patient_restore=restore-cookie-123',
            'x-medora-site': 'beauty',
          },
        },
        response: {
          status: 200,
          body: {
            messages: [{ role: 'assistant', text: 'Welcome' }],
          },
          bodyText: null,
          headers: {
            'x-request-id': 'req-123',
          },
        },
      },
    ],
    notes: ['control-plane evidence present'],
    ...overrides,
  };
}

function makeFailureScenario({
  scenarioId,
  outcome,
  failureCategory,
  failedPhase,
  usableForControlPlaneJudgment,
  sessionId,
  summary,
}: {
  scenarioId: string;
  outcome: 'SOFT_FAIL' | 'HARD_FAIL';
  failureCategory: DogfoodFailureCategory;
  failedPhase: DogfoodFailurePhase;
  usableForControlPlaneJudgment: boolean;
  sessionId: string | null;
  summary: string;
}): ScenarioOutcome {
  const transportErrorKind = failureCategory === 'chat_transport' ? 'timeout' : undefined;

  return makeScenarioOutcome({
    scenarioId,
    outcome,
    summary,
    failureCategory,
    failedPhase,
    usableForControlPlaneJudgment,
    bootstrapAttempts: [
      {
        phase: 'bootstrap',
        turnIndex: null,
        attempt: 1,
        durationMs: 111,
        status: failureCategory === 'bootstrap' ? 502 : 200,
        retried: failureCategory === 'bootstrap',
      },
    ],
    chatAttempts: [
      {
        phase: 'chat',
        turnIndex: 0,
        attempt: 2,
        durationMs: 222,
        ...(transportErrorKind ? { transportErrorKind } : { status: failureCategory === 'chat_http' ? 500 : 200 }),
        retried: false,
      },
    ],
    sessionId,
    turns: [
      {
        scenarioId,
        turnIndex: 0,
        requestUrl: `https://crm.example.com/api/v3/chatbot/chat?scenario=${scenarioId}`,
        requestAttempt: 2,
        durationMs: 222,
        ...(transportErrorKind ? { transportErrorKind } : {}),
        request: {
          method: 'POST',
          path: '/api/v3/chatbot/chat',
          body: { sessionId, message: `Fixture for ${scenarioId}` },
          headers: {
            cookie: 'patient_session=session-cookie-123; patient_restore=restore-cookie-123; restore_token=restore-token-xyz',
            'x-medora-site': 'beauty',
          },
        },
        response: {
          status: transportErrorKind ? 0 : failureCategory === 'chat_http' ? 500 : 200,
          body: { ok: !transportErrorKind, failureCategory },
          bodyText: transportErrorKind
            ? 'fetch failed; patient_session=session-cookie-123; patient_restore=restore-cookie-123'
            : JSON.stringify({ failureCategory }),
          headers: {
            'x-request-id': `req-${scenarioId}`,
          },
        },
      },
    ],
    notes: [`${failureCategory} note`],
  });
}

test('reporting writes the expected UTC artifact folder and redacts human-readable outputs', () => {
  const workspaceRoot = resolve('/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot');
  const outputRoot = mkdtempSync(join(tmpdir(), 'chatbot-v3-dogfood-reporting-'));

  const config = {
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    runTimestamp: '2026-04-18T14-05-09Z',
    artifactSchemaVersion: 1 as const,
  };
  const rollup: RunRollup = {
    outcome: 'PASS',
    scenarioOutcomes: [makeScenarioOutcome()],
  };

  const artifactDir = writeDogfoodArtifacts({
    workspaceRoot,
    outputRoot,
    config,
    bootstrapResults: [makeBootstrapResult()],
    rollup,
    gitCommit: 'abc1234',
  });

  assert.equal(artifactDir, join(outputRoot, 'artifacts/chatbot-v3-real-api-dogfood/2026-04-18T14-05-09Z'));

  const fileNames = readdirSync(artifactDir).sort();
  assert.deepEqual(fileNames, ['bug-backlog.md', 'report.md', 'run-metadata.json', 'transcripts.json']);

  const reportMarkdown = readFileSync(join(artifactDir, 'report.md'), 'utf8');
  const bugBacklogMarkdown = readFileSync(join(artifactDir, 'bug-backlog.md'), 'utf8');
  const transcriptsJson = JSON.parse(readFileSync(join(artifactDir, 'transcripts.json'), 'utf8')) as {
    bootstrapResults: Array<{
      patientSession: string | null;
      patientRestore: string | null;
      redactedCookies: string[];
    }>;
    rollup: {
      scenarioOutcomes: Array<{
        summary: string;
      }>;
    };
    scenarioTranscripts: Array<{
      summary: string;
    }>;
  };
  const runMetadata = JSON.parse(readFileSync(join(artifactDir, 'run-metadata.json'), 'utf8')) as {
    artifactSchemaVersion: number;
  };

  assert.match(reportMarkdown, /patient_session=REDACTED/);
  assert.match(reportMarkdown, /patient_restore=REDACTED/);
  assert.match(reportMarkdown, /widget-chat-session-123/);
  assert.match(bugBacklogMarkdown, /patient_session=REDACTED/);
  assert.match(bugBacklogMarkdown, /patient_restore=REDACTED/);
  assert.equal(transcriptsJson.bootstrapResults[0]?.scenarioId, 'allowed_after_patient_session');
  assert.equal(transcriptsJson.bootstrapResults[0]?.baseUrl, 'https://crm.example.com');
  assert.equal(transcriptsJson.bootstrapResults[0]?.site, 'beauty');
  assert.equal(transcriptsJson.bootstrapResults[0]?.timestamp, '2026-04-18T14-05-09Z');
  assert.equal(transcriptsJson.bootstrapResults[0]?.bootstrapMode, 'chat_allowed');
  assert.equal(transcriptsJson.bootstrapResults[0]?.patientSession, 'REDACTED');
  assert.equal(transcriptsJson.bootstrapResults[0]?.patientRestore, 'REDACTED');
  assert.equal(transcriptsJson.bootstrapResults[0]?.widgetChatTargetSessionId, 'REDACTED');
  assert.deepEqual(transcriptsJson.bootstrapResults[0]?.redactedCookies, [
    'patient_restore=REDACTED',
    'patient_session=REDACTED',
  ]);
  assert.equal(
    transcriptsJson.rollup.scenarioOutcomes[0]?.summary,
    'all four axes passed; patient_session=REDACTED; patient_restore=REDACTED; chatbot_session_secret=REDACTED; restore_token=REDACTED',
  );
  assert.equal(
    transcriptsJson.scenarioTranscripts[0]?.summary,
    'all four axes passed; patient_session=REDACTED; patient_restore=REDACTED; chatbot_session_secret=REDACTED; restore_token=REDACTED',
  );
  assert.ok(!JSON.stringify(transcriptsJson).includes('session-cookie-123'));
  assert.ok(!JSON.stringify(transcriptsJson).includes('restore-cookie-123'));
  assert.ok(!JSON.stringify(transcriptsJson).includes('chatbot-secret-abc'));
  assert.ok(!JSON.stringify(transcriptsJson).includes('restore-token-xyz'));
  assert.equal(runMetadata.artifactSchemaVersion, 1);
});

test('reporting groups scenario outcomes and preserves structured transcript fields', () => {
  const workspaceRoot = resolve('/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-event-reducer');
  const outputRoot = mkdtempSync(join(tmpdir(), 'chatbot-v3-dogfood-reporting-groups-'));

  const config = {
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    runTimestamp: '2026-04-27T10-20-30Z',
    artifactSchemaVersion: 1 as const,
  };
  const rollup: RunRollup = {
    outcome: 'HARD_FAIL',
    scenarioOutcomes: [
      makeFailureScenario({
        scenarioId: 'preflight_environment_missing_key',
        outcome: 'HARD_FAIL',
        failureCategory: 'environment',
        failedPhase: 'preflight',
        usableForControlPlaneJudgment: false,
        sessionId: null,
        summary: 'preflight missing API key | retry later\ncheck env',
      }),
      makeFailureScenario({
        scenarioId: 'bootstrap_missing_session',
        outcome: 'HARD_FAIL',
        failureCategory: 'bootstrap',
        failedPhase: 'bootstrap',
        usableForControlPlaneJudgment: false,
        sessionId: null,
        summary: 'bootstrap failed before chat session',
      }),
      makeFailureScenario({
        scenarioId: 'chat_transport_timeout',
        outcome: 'HARD_FAIL',
        failureCategory: 'chat_transport',
        failedPhase: 'chat',
        usableForControlPlaneJudgment: false,
        sessionId: 'sess_transport',
        summary: 'timeout calling chat API',
      }),
      makeFailureScenario({
        scenarioId: 'chat_http_500',
        outcome: 'HARD_FAIL',
        failureCategory: 'chat_http',
        failedPhase: 'chat',
        usableForControlPlaneJudgment: false,
        sessionId: 'sess_http',
        summary: 'HTTP 500 from chat API',
      }),
      makeFailureScenario({
        scenarioId: 'control_plane_wrong_next_action',
        outcome: 'HARD_FAIL',
        failureCategory: 'control_plane',
        failedPhase: 'evaluation',
        usableForControlPlaneJudgment: true,
        sessionId: 'sess_control',
        summary: 'JourneyReducer selected wrong nextAction',
      }),
      makeFailureScenario({
        scenarioId: 'composer_copy_quality',
        outcome: 'SOFT_FAIL',
        failureCategory: 'agent_or_composer',
        failedPhase: 'evaluation',
        usableForControlPlaneJudgment: true,
        sessionId: 'sess_agent',
        summary: 'composer copy was not helpful',
      }),
      makeScenarioOutcome(),
    ],
  };

  const artifactDir = writeDogfoodArtifacts({
    workspaceRoot,
    outputRoot,
    config,
    bootstrapResults: [makeBootstrapResult()],
    rollup,
  });

  const reportMarkdown = readFileSync(join(artifactDir, 'report.md'), 'utf8');
  const bugBacklogMarkdown = readFileSync(join(artifactDir, 'bug-backlog.md'), 'utf8');
  const transcriptsJson = JSON.parse(readFileSync(join(artifactDir, 'transcripts.json'), 'utf8')) as {
    scenarioTranscripts: Array<{
      scenarioId: string;
      outcome: ScenarioOutcome['outcome'];
      summary: string;
      failureCategory?: DogfoodFailureCategory;
      failedPhase?: DogfoodFailurePhase;
      usableForControlPlaneJudgment?: boolean;
      bootstrapAttempts?: Array<{ attempt: number; durationMs: number; turnIndex: number | null }>;
      chatAttempts?: Array<{ attempt: number; durationMs: number; turnIndex: number | null; transportErrorKind?: string }>;
      sessionId?: string | null;
      notes?: string[];
      turns: Array<{
        requestUrl?: string;
        requestAttempt?: number;
        durationMs?: number;
        transportErrorKind?: string;
        request: { path: string; body: unknown; headers: Record<string, string> };
        response: { status: number; body: unknown; bodyText: string | null };
      }>;
    }>;
  };

  for (const section of [
    '## Environment Failures',
    '## Bootstrap Failures',
    '## Chat Transport / HTTP Failures',
    '## Control-Plane Failures',
    '## Agent / Composer Failures',
    '## Passed Control-Plane Evidence',
  ]) {
    assert.match(reportMarkdown, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(
    reportMarkdown,
    /\| Scenario \| Outcome \| Category \| Phase \| Control-plane usable \| Session \| Summary \|/,
  );
  assert.match(
    reportMarkdown,
    /\| `preflight_environment_missing_key` \| `HARD_FAIL` \| `environment` \| `preflight` \| `false` \| _none_ \| preflight missing API key \\\| retry later<br>check env \|/,
  );
  assert.match(
    reportMarkdown,
    /\| `control_plane_wrong_next_action` \| `HARD_FAIL` \| `control_plane` \| `evaluation` \| `true` \| `sess_control` \| JourneyReducer selected wrong nextAction \|/,
  );
  assert.match(
    reportMarkdown,
    /python3 '\/Users\/haowang\/Desktop\/claws\/medical-crm-v2\/\.worktrees\/phase1-event-reducer\/scripts\/tail_journalctl\.py'[\s\S]*sess_transport\|sess_http\|sess_control\|sess_agent\|widget-chat-session-123/,
  );

  assert.match(bugBacklogMarkdown, /\| Scenario \| Outcome \| Category \| Phase \| Summary \|/);
  assert.match(
    bugBacklogMarkdown,
    /\| `preflight_environment_missing_key` \| `HARD_FAIL` \| `environment` \| `preflight` \| preflight missing API key \\\| retry later<br>check env \|/,
  );
  assert.match(bugBacklogMarkdown, /\| `chat_transport_timeout` \| `HARD_FAIL` \| `chat_transport` \| `chat` \| timeout calling chat API \|/);

  const environmentTranscript = transcriptsJson.scenarioTranscripts.find(
    (scenario) => scenario.scenarioId === 'preflight_environment_missing_key',
  );
  assert.equal(environmentTranscript?.failureCategory, 'environment');
  assert.equal(environmentTranscript?.failedPhase, 'preflight');
  assert.equal(environmentTranscript?.usableForControlPlaneJudgment, false);
  assert.equal(environmentTranscript?.bootstrapAttempts?.[0]?.attempt, 1);
  assert.equal(environmentTranscript?.bootstrapAttempts?.[0]?.durationMs, 111);
  assert.equal(environmentTranscript?.bootstrapAttempts?.[0]?.turnIndex, null);
  assert.equal(environmentTranscript?.chatAttempts?.[0]?.attempt, 2);
  assert.equal(environmentTranscript?.chatAttempts?.[0]?.durationMs, 222);
  assert.equal(environmentTranscript?.chatAttempts?.[0]?.turnIndex, 0);
  assert.equal(environmentTranscript?.sessionId, null);
  assert.deepEqual(environmentTranscript?.notes, ['environment note']);

  const transportTranscript = transcriptsJson.scenarioTranscripts.find(
    (scenario) => scenario.scenarioId === 'chat_transport_timeout',
  );
  const transportTurn = transportTranscript?.turns[0];
  assert.equal(transportTurn?.requestUrl, 'https://crm.example.com/api/v3/chatbot/chat?scenario=chat_transport_timeout');
  assert.equal(transportTurn?.requestAttempt, 2);
  assert.equal(transportTurn?.durationMs, 222);
  assert.equal(transportTurn?.transportErrorKind, 'timeout');
  assert.equal(transportTurn?.request.path, '/api/v3/chatbot/chat');
  assert.deepEqual(transportTurn?.request.body, { sessionId: 'sess_transport', message: 'Fixture for chat_transport_timeout' });
  assert.equal(transportTurn?.request.headers.cookie, 'patient_session=REDACTED; patient_restore=REDACTED; restore_token=REDACTED');
  assert.equal(transportTurn?.response.status, 0);
  assert.deepEqual(transportTurn?.response.body, { ok: false, failureCategory: 'chat_transport' });
  assert.equal(transportTurn?.response.bodyText, 'fetch failed; patient_session=REDACTED; patient_restore=REDACTED');
  assert.equal(transportTranscript?.chatAttempts?.[0]?.transportErrorKind, 'timeout');

  for (const scenario of transcriptsJson.scenarioTranscripts.filter((entry) => entry.outcome !== 'PASS')) {
    assert.ok(scenario.failureCategory, `${scenario.scenarioId} should include failureCategory`);
    assert.ok(scenario.failedPhase, `${scenario.scenarioId} should include failedPhase`);
    assert.equal(typeof scenario.usableForControlPlaneJudgment, 'boolean');
  }

  const serialized = JSON.stringify(transcriptsJson);
  assert.ok(!serialized.includes('session-cookie-123'));
  assert.ok(!serialized.includes('restore-cookie-123'));
  assert.ok(!serialized.includes('restore-token-xyz'));
});
