import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildRunMetadata,
  formatUtcRunId,
  parseDogfoodConfig,
} from '../chatbot-v3-real-api-dogfood/config.ts';

test('missing base URL fails loudly', () => {
  assert.throws(
    () => parseDogfoodConfig([], { DOGFOOD_SITE: 'site-a' }),
    (error: any) => {
      assert.match(error.message, /base url/i);
      return true;
    },
  );
});

test('missing site fails loudly', () => {
  assert.throws(
    () => parseDogfoodConfig(['--base-url', 'https://example.com'], {}),
    (error: any) => {
      assert.match(error.message, /site/i);
      return true;
    },
  );
});

test('base URL normalization preserves query-string slashes', () => {
  const config = parseDogfoodConfig(
    ['--base-url', 'https://example.com/?next=/', '--site', 'site-a'],
    {},
  );

  assert.equal(config.baseUrl, 'https://example.com/?next=/');
});

test('base URL normalization preserves embedded credentials', () => {
  const config = parseDogfoodConfig(
    ['--base-url', 'https://user:pass@example.com/?next=/', '--site', 'site-a'],
    {},
  );

  assert.equal(config.baseUrl, 'https://user:pass@example.com/?next=/');
});

test('UTC run ids are formatted safely for filenames', () => {
  const runId = formatUtcRunId(new Date('2026-04-18T14:05:09.123Z'));

  assert.equal(runId, '2026-04-18T14-05-09Z');
});

test('run metadata schema version defaults to 1', () => {
  const config = parseDogfoodConfig(
    ['--base-url', 'https://example.com', '--site', 'site-a'],
    {},
  );

  const metadata = buildRunMetadata({
    config,
    executedScenarioIds: ['blocked_without_prereq', 'allowed_after_patient_session'],
    redactedCookies: ['session=REDACTED'],
  });

  assert.deepEqual(metadata, {
    artifactSchemaVersion: 1,
    runTimestamp: config.runTimestamp,
    baseUrl: 'https://example.com',
    site: 'site-a',
    executedScenarioIds: ['blocked_without_prereq', 'allowed_after_patient_session'],
    redactedCookies: ['session=REDACTED'],
    gitCommit: null,
  });
});

test('pins the v1 scenario matrix and matrix doc', async () => {
  const scenarios = await import('../chatbot-v3-real-api-dogfood/scenarios.ts');
  const scenarioById = new Map(scenarios.DOGFOOD_SCENARIOS.map((scenario) => [scenario.id, scenario]));

  assert.deepEqual(
    scenarios.DOGFOOD_SCENARIO_IDS,
    [
      'blocked_without_prereq',
      'allowed_after_patient_session',
      'intake_to_triage_opening',
      'triage_to_recommendation',
      'recommendation_selected_to_consult',
      'faq_detour_no_progression',
      'handoff_denied_returns_to_current_step',
      'recommendation_to_explain',
      'direct_human_request_to_handoff',
      'recommendation_revisit_compare',
      'repeat_explain',
      'degraded_then_retry',
    ],
  );

  assert.deepEqual(scenarios.V1_REQUIRED_SCENARIO_IDS, [
    'blocked_without_prereq',
    'allowed_after_patient_session',
    'intake_to_triage_opening',
    'triage_to_recommendation',
    'recommendation_selected_to_consult',
    'faq_detour_no_progression',
    'handoff_denied_returns_to_current_step',
  ]);

  assert.deepEqual(scenarios.V1_DEFERRED_SCENARIO_IDS, [
    'recommendation_to_explain',
    'direct_human_request_to_handoff',
    'recommendation_revisit_compare',
    'repeat_explain',
    'degraded_then_retry',
  ]);

  assert.equal(scenarios.getScenarioById('blocked_without_prereq').bootstrapMode, 'blocked_expected');
  assert.equal(
    scenarios.getScenarioById('allowed_after_patient_session').bootstrapMode,
    'chat_allowed',
  );
  assert.equal(scenarios.getScenarioById('blocked_without_prereq').expected.access, 'blocked');
  assert.equal(scenarios.getScenarioById('allowed_after_patient_session').expected.access, 'allowed');
  assert.equal(scenarios.getScenarioById('faq_detour_no_progression').expected.continuity, 'multi-turn');

  const matrixDocPath = resolve(
    fileURLToPath(new URL('../..', import.meta.url)),
    'docs/analysis/2026-04-18-chatbot-v3-real-api-session-dogfood-matrix.md',
  );
  const matrixDoc = readFileSync(matrixDocPath, 'utf8');

  const tableRows = matrixDoc
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replace(/^`|`$/g, ''));

      return {
        scenarioId: cells[0],
        bootstrapMode: cells[1],
        v1Status: cells[2],
        why: cells[3],
        healthyOutcomeLevel: cells[4],
        turnShape: cells[5],
      };
    });

  assert.equal(tableRows.length, scenarios.DOGFOOD_SCENARIOS.length);

  for (const row of tableRows) {
    const scenario = scenarioById.get(row.scenarioId);

    assert.ok(scenario, `missing scenario metadata for ${row.scenarioId}`);
    assert.equal(row.bootstrapMode, scenario.bootstrapMode);
    assert.equal(row.v1Status.toLowerCase(), scenario.v1Status);
    assert.equal(row.healthyOutcomeLevel, scenario.healthyOutcomeLevel);
    assert.equal(row.turnShape, scenario.expected.continuity);
    assert.match(row.why, new RegExp(escapeRegExpPhrase(expectedDocWhyForScenario(row.scenarioId))));
  }
});

function expectedDocWhyForScenario(scenarioId: string) {
  switch (scenarioId) {
    case 'blocked_without_prereq':
      return 'Canonical negative control proving chat is rejected before the patient prerequisite exists.';
    case 'allowed_after_patient_session':
      return 'Canonical allowed onboarding bootstrap proving we can establish a chat-capable patient session.';
    case 'intake_to_triage_opening':
      return 'Verifies the first allowed chat response opens the intake-to-triage path.';
    case 'triage_to_recommendation':
      return 'Verifies the core progression from triage into recommendation on the real API.';
    case 'recommendation_selected_to_consult':
      return 'Verifies the recommended-next-step flow reaches consult.';
    case 'faq_detour_no_progression':
      return 'Verifies a FAQ/resource detour does not silently advance the journey.';
    case 'handoff_denied_returns_to_current_step':
      return 'Verifies denied escalation recovers by returning to the current step.';
    case 'recommendation_to_explain':
      return 'Useful follow-up coverage after the required recommendation flow is stable.';
    case 'direct_human_request_to_handoff':
      return 'Useful follow-up coverage once basic consult continuity is proven.';
    case 'recommendation_revisit_compare':
      return 'Useful second-wave semantic coverage for comparing or revisiting recommendations.';
    case 'repeat_explain':
      return 'Useful second-wave continuity coverage for repeated explanations.';
    case 'degraded_then_retry':
      return 'Useful once baseline failure evidence exists and retry behavior needs checking.';
    default:
      throw new Error(`Unhandled scenario ${scenarioId}`);
  }
}

function escapeRegExpPhrase(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
