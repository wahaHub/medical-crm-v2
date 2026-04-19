import test from 'node:test';
import assert from 'node:assert/strict';

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
