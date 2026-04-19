import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { writeDogfoodArtifacts } from '../chatbot-v3-real-api-dogfood/reporting.ts';
import type {
  BootstrapSuccessResult,
  RunRollup,
  ScenarioOutcome,
} from '../chatbot-v3-real-api-dogfood/types.ts';

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
  };
}

function makeScenarioOutcome(): ScenarioOutcome {
  return {
    scenarioId: 'allowed_after_patient_session',
    outcome: 'PASS',
    summary:
      'all four axes passed; patient_session=session-cookie-123; patient_restore=restore-cookie-123; chatbot_session_secret=chatbot-secret-abc; restore_token=restore-token-xyz',
    turns: [
      {
        scenarioId: 'allowed_after_patient_session',
        turnIndex: 0,
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
  };
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
