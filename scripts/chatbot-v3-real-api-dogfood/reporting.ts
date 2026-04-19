import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildRunMetadata } from './config.ts';
import type { BootstrapSuccessResult } from './bootstrap.ts';
import type { DogfoodConfig, RunMetadata, RunRollup, ScenarioOutcome, TurnTranscript } from './types.ts';

export interface WriteDogfoodArtifactsOptions {
  workspaceRoot: string;
  outputRoot: string;
  config: DogfoodConfig;
  bootstrapResults: BootstrapSuccessResult[];
  rollup: RunRollup;
  gitCommit?: string | null;
}

interface TranscriptArtifact {
  artifactSchemaVersion: 1;
  runTimestamp: string;
  baseUrl: string;
  site: string;
  bootstrapResults: BootstrapSuccessResult[];
  rollup: RunRollup;
  scenarioTranscripts: Array<{
    scenarioId: string;
    outcome: ScenarioOutcome['outcome'];
    summary: string;
    turns: TurnTranscript[];
  }>;
}

const SENSITIVE_COOKIE_PATTERNS: Array<[RegExp, string]> = [
  [/patient_session=[^;\s]+/gi, 'patient_session=REDACTED'],
  [/patient_restore=[^;\s]+/gi, 'patient_restore=REDACTED'],
  [/chatbot_session_secret=[^;\s]+/gi, 'chatbot_session_secret=REDACTED'],
  [/restore[_-]?token=[^;\s]+/gi, 'restore_token=REDACTED'],
];

function redactSensitiveText(value: string) {
  return SENSITIVE_COOKIE_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function redactDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSensitiveText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactDeep(entry)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, redactDeep(entry)]),
    ) as T;
  }

  return value;
}

function uniqueRedactedCookies(bootstrapResults: BootstrapSuccessResult[]) {
  return Array.from(new Set(bootstrapResults.flatMap((result) => result.redactedCookies))).sort((left, right) =>
    left.localeCompare(right),
  );
}

function buildArtifactDir(outputRoot: string, runTimestamp: string) {
  return resolve(outputRoot, 'artifacts', 'chatbot-v3-real-api-dogfood', runTimestamp);
}

function renderBootstrapSection(bootstrapResults: BootstrapSuccessResult[]) {
  const lines = ['## Bootstrap Results', '', '| Scenario | Mode | Widget session | Redacted cookies |', '|---|---|---|---|'];

  for (const result of bootstrapResults) {
    lines.push(
      `| \`${result.scenarioId}\` | \`${result.bootstrapMode}\` | ${result.widgetChatTargetSessionId ? `\`${result.widgetChatTargetSessionId}\`` : '_none_'} | ${result.redactedCookies.map((cookie) => `\`${redactSensitiveText(cookie)}\``).join(', ')} |`,
    );
  }

  return lines.join('\n');
}

function renderScenarioSection(rollup: RunRollup) {
  const lines = ['## Scenario Rollup', '', '| Scenario | Outcome | Summary |', '|---|---|---|'];

  for (const outcome of rollup.scenarioOutcomes) {
    lines.push(`| \`${outcome.scenarioId}\` | \`${outcome.outcome}\` | ${redactSensitiveText(outcome.summary)} |`);
  }

  return lines.join('\n');
}

function renderReportMarkdown({
  config,
  bootstrapResults,
  rollup,
}: {
  config: DogfoodConfig;
  bootstrapResults: BootstrapSuccessResult[];
  rollup: RunRollup;
}) {
  const redactedCookies = uniqueRedactedCookies(bootstrapResults);

  return [
    '# Chatbot V3 Real API Dogfood Report',
    '',
    `- Run timestamp: \`${config.runTimestamp}\``,
    `- Base URL: \`${config.baseUrl}\``,
    `- Site: \`${config.site}\``,
    `- Overall outcome: \`${rollup.outcome}\``,
    `- Redacted cookies: ${redactedCookies.length > 0 ? redactedCookies.map((cookie) => `\`${cookie}\``).join(', ') : '_none_'}`,
    '',
    renderBootstrapSection(bootstrapResults),
    '',
    renderScenarioSection(rollup),
    '',
  ].join('\n');
}

function renderBugBacklogMarkdown({
  config,
  bootstrapResults,
  rollup,
}: {
  config: DogfoodConfig;
  bootstrapResults: BootstrapSuccessResult[];
  rollup: RunRollup;
}) {
  const redactedCookies = uniqueRedactedCookies(bootstrapResults);
  const failingScenarios = rollup.scenarioOutcomes.filter((scenarioOutcome) => scenarioOutcome.outcome !== 'PASS');

  const lines = [
    '# Chatbot V3 Real API Dogfood Bug Backlog',
    '',
    `- Run timestamp: \`${config.runTimestamp}\``,
    `- Base URL: \`${config.baseUrl}\``,
    `- Site: \`${config.site}\``,
    `- Redacted cookies: ${redactedCookies.length > 0 ? redactedCookies.map((cookie) => `\`${cookie}\``).join(', ') : '_none_'}`,
    '',
  ];

  if (failingScenarios.length === 0) {
    lines.push('No bugs were discovered in this run.');
    return lines.join('\n');
  }

  lines.push('| Scenario | Outcome | Summary |');
  lines.push('|---|---|---|');

  for (const scenarioOutcome of failingScenarios) {
    lines.push(
      `| \`${scenarioOutcome.scenarioId}\` | \`${scenarioOutcome.outcome}\` | ${redactSensitiveText(scenarioOutcome.summary)} |`,
    );
  }

  return lines.join('\n');
}

function serializeTranscripts({
  config,
  bootstrapResults,
  rollup,
}: {
  config: DogfoodConfig;
  bootstrapResults: BootstrapSuccessResult[];
  rollup: RunRollup;
}): TranscriptArtifact {
  return {
    artifactSchemaVersion: 1,
    runTimestamp: config.runTimestamp,
    baseUrl: config.baseUrl,
    site: config.site,
    bootstrapResults: redactDeep(bootstrapResults),
    rollup: redactDeep(rollup),
    scenarioTranscripts: rollup.scenarioOutcomes.map((scenarioOutcome) => ({
      scenarioId: scenarioOutcome.scenarioId,
      outcome: scenarioOutcome.outcome,
      summary: scenarioOutcome.summary,
      turns: redactDeep(scenarioOutcome.turns),
    })),
  };
}

export function writeDogfoodArtifacts({
  workspaceRoot,
  outputRoot,
  config,
  bootstrapResults,
  rollup,
  gitCommit = null,
}: WriteDogfoodArtifactsOptions) {
  const artifactDir = buildArtifactDir(outputRoot, config.runTimestamp);
  mkdirSync(artifactDir, { recursive: true });

  const metadata: RunMetadata = buildRunMetadata({
    config,
    executedScenarioIds: rollup.scenarioOutcomes.map((scenarioOutcome) => scenarioOutcome.scenarioId),
    redactedCookies: uniqueRedactedCookies(bootstrapResults),
    gitCommit,
  });

  const files: Array<[string, string]> = [
    ['report.md', renderReportMarkdown({ config, bootstrapResults, rollup })],
    ['transcripts.json', `${JSON.stringify(serializeTranscripts({ config, bootstrapResults, rollup }), null, 2)}\n`],
    ['bug-backlog.md', renderBugBacklogMarkdown({ config, bootstrapResults, rollup })],
    ['run-metadata.json', `${JSON.stringify(metadata, null, 2)}\n`],
  ];

  for (const [fileName, contents] of files) {
    writeFileSync(join(artifactDir, fileName), contents, 'utf8');
  }

  return artifactDir;
}

export function buildDogfoodArtifactDir(outputRoot: string, runTimestamp: string) {
  return buildArtifactDir(outputRoot, runTimestamp);
}
