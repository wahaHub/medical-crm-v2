import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildRunMetadata } from './config.ts';
import type { BootstrapSuccessResult } from './bootstrap.ts';
import type { DogfoodConfig, DogfoodFailureCategory, RunMetadata, RunRollup, ScenarioOutcome, TurnTranscript } from './types.ts';

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
    failureCategory?: ScenarioOutcome['failureCategory'];
    failedPhase?: ScenarioOutcome['failedPhase'];
    usableForControlPlaneJudgment: boolean;
    bootstrapAttempts: ScenarioOutcome['bootstrapAttempts'];
    chatAttempts: ScenarioOutcome['chatAttempts'];
    sessionId: string | null;
    notes: string[];
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

function redactStructuredText(value: string) {
  return redactSensitiveText(value);
}

function markdownTableCell(value: string) {
  return redactSensitiveText(value)
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function sanitizeBootstrapResult(result: BootstrapSuccessResult) {
  return {
    scenarioId: result.scenarioId,
    baseUrl: result.baseUrl,
    site: result.site,
    timestamp: result.timestamp,
    bootstrapMode: result.bootstrapMode,
    patientSession: result.patientSession ? 'REDACTED' : null,
    patientRestore: result.patientRestore ? 'REDACTED' : null,
    widgetChatTargetSessionId: result.widgetChatTargetSessionId ? 'REDACTED' : null,
    redactedCookies: [...result.redactedCookies],
  };
}

function sanitizeTurnTranscript(turn: TurnTranscript) {
  return {
    ...turn,
    request: {
      ...turn.request,
      body: redactDeep(turn.request.body),
      headers: redactDeep(turn.request.headers),
    },
    response: {
      ...turn.response,
      body: redactDeep(turn.response.body),
      bodyText: turn.response.bodyText ? redactStructuredText(turn.response.bodyText) : null,
      headers: redactDeep(turn.response.headers),
    },
  };
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

const SCENARIO_ROW_HEADER = '| Scenario | Outcome | Category | Phase | Control-plane usable | Session | Summary |';
const SCENARIO_ROW_DIVIDER = '|---|---|---|---|---|---|---|';

function scenarioCategoryLabel(outcome: ScenarioOutcome) {
  return outcome.failureCategory ? `\`${outcome.failureCategory}\`` : '_none_';
}

function scenarioPhaseLabel(outcome: ScenarioOutcome) {
  return outcome.failedPhase ? `\`${outcome.failedPhase}\`` : '_none_';
}

function scenarioSessionLabel(outcome: ScenarioOutcome) {
  return outcome.sessionId ? `\`${redactSensitiveText(outcome.sessionId)}\`` : '_none_';
}

function renderScenarioRow(outcome: ScenarioOutcome) {
  return [
    `\`${outcome.scenarioId}\``,
    `\`${outcome.outcome}\``,
    scenarioCategoryLabel(outcome),
    scenarioPhaseLabel(outcome),
    `\`${String(outcome.usableForControlPlaneJudgment)}\``,
    scenarioSessionLabel(outcome),
    markdownTableCell(outcome.summary),
  ].join(' | ');
}

function renderGroupedScenarioSection(title: string, outcomes: ScenarioOutcome[]) {
  const lines = [`## ${title}`, '', SCENARIO_ROW_HEADER, SCENARIO_ROW_DIVIDER];

  if (outcomes.length === 0) {
    lines.push('| _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ |');
    return lines.join('\n');
  }

  for (const outcome of outcomes) {
    lines.push(`| ${renderScenarioRow(outcome)} |`);
  }

  return lines.join('\n');
}

function renderScenarioSections(rollup: RunRollup) {
  const byCategory = (categories: DogfoodFailureCategory[]) =>
    rollup.scenarioOutcomes.filter((outcome) => outcome.failureCategory && categories.includes(outcome.failureCategory));
  const passedControlPlaneEvidence = rollup.scenarioOutcomes.filter((outcome) => outcome.outcome === 'PASS');

  const sections = [
    renderGroupedScenarioSection('Environment Failures', byCategory(['environment'])),
    renderGroupedScenarioSection('Bootstrap Failures', byCategory(['bootstrap'])),
    renderGroupedScenarioSection('Chat Transport / HTTP Failures', byCategory(['chat_transport', 'chat_http'])),
    renderGroupedScenarioSection('Control-Plane Failures', byCategory(['control_plane'])),
    renderGroupedScenarioSection('Agent / Composer Failures', byCategory(['agent_or_composer'])),
    renderGroupedScenarioSection('Passed Control-Plane Evidence', passedControlPlaneEvidence),
  ];

  return sections.join('\n\n');
}

function collectSessionIds(rollup: RunRollup) {
  return Array.from(
    new Set(
      rollup.scenarioOutcomes
        .map((outcome) => outcome.sessionId)
        .filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.trim().length > 0),
    ),
  );
}

function renderLightsailLogCommand(rollup: RunRollup, workspaceRoot: string) {
  const sessionIds = collectSessionIds(rollup);
  const sessionPattern = sessionIds.length > 0 ? `${sessionIds.map(redactSensitiveText).join('|')}|<SESSION_ID>` : '<SESSION_ID>';
  const tailJournalctlPath = join(workspaceRoot, 'scripts', 'tail_journalctl.py');

  return [
    '## Quick Lightsail Log Command',
    '',
    '```bash',
    `python3 ${shellQuote(tailJournalctlPath)} \\`,
    '  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem \\',
    '  --since "20 minutes ago" \\',
    `  --lines 1200 | rg '${sessionPattern}|chatbot-v3.node-event|JourneyReducer|NextActionResolver|fallbackUsed|schemaValidationFailed'`,
    '```',
  ].join('\n');
}

function renderBugBacklogCategorySection(category: DogfoodFailureCategory, outcomes: ScenarioOutcome[]) {
  const lines = [`## ${category}`, '', '| Scenario | Outcome | Category | Phase | Summary |', '|---|---|---|---|---|'];

  for (const scenarioOutcome of outcomes) {
    lines.push(
      `| \`${scenarioOutcome.scenarioId}\` | \`${scenarioOutcome.outcome}\` | ${scenarioCategoryLabel(scenarioOutcome)} | ${scenarioPhaseLabel(scenarioOutcome)} | ${markdownTableCell(scenarioOutcome.summary)} |`,
    );
  }

  return lines.join('\n');
}

function renderReportMarkdown({
  workspaceRoot,
  config,
  bootstrapResults,
  rollup,
}: {
  workspaceRoot: string;
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
    renderScenarioSections(rollup),
    '',
    renderLightsailLogCommand(rollup, workspaceRoot),
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

  const categories: DogfoodFailureCategory[] = [
    'environment',
    'bootstrap',
    'chat_transport',
    'chat_http',
    'control_plane',
    'agent_or_composer',
  ];

  for (const category of categories) {
    const categoryScenarios = failingScenarios.filter((scenarioOutcome) => scenarioOutcome.failureCategory === category);
    if (categoryScenarios.length > 0) {
      lines.push(renderBugBacklogCategorySection(category, categoryScenarios), '');
    }
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
    bootstrapResults: bootstrapResults.map((result) => sanitizeBootstrapResult(result)),
    rollup: redactDeep(rollup),
    scenarioTranscripts: rollup.scenarioOutcomes.map((scenarioOutcome) => ({
      scenarioId: scenarioOutcome.scenarioId,
      outcome: scenarioOutcome.outcome,
      summary: redactStructuredText(scenarioOutcome.summary),
      ...(scenarioOutcome.failureCategory ? { failureCategory: scenarioOutcome.failureCategory } : {}),
      ...(scenarioOutcome.failedPhase ? { failedPhase: scenarioOutcome.failedPhase } : {}),
      usableForControlPlaneJudgment: scenarioOutcome.usableForControlPlaneJudgment,
      bootstrapAttempts: redactDeep(scenarioOutcome.bootstrapAttempts),
      chatAttempts: redactDeep(scenarioOutcome.chatAttempts),
      sessionId: scenarioOutcome.sessionId ? redactSensitiveText(scenarioOutcome.sessionId) : null,
      notes: scenarioOutcome.notes.map((note) => redactStructuredText(note)),
      turns: scenarioOutcome.turns.map((turn) => sanitizeTurnTranscript(turn)),
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
    ['report.md', renderReportMarkdown({ workspaceRoot, config, bootstrapResults, rollup })],
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
