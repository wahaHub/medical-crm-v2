import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildRunMetadata } from './config.ts';
import type { BootstrapSuccessResult } from './bootstrap.ts';
import { getScenarioById } from './scenarios.ts';
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
    qualityGate?: 'required' | 'observed' | 'local_only';
    outcome: ScenarioOutcome['outcome'];
    summary: string;
    failureCategory?: ScenarioOutcome['failureCategory'];
    failedPhase?: ScenarioOutcome['failedPhase'];
    usableForControlPlaneJudgment: boolean;
    bootstrapAttempts: ScenarioOutcome['bootstrapAttempts'];
    chatAttempts: ScenarioOutcome['chatAttempts'];
    sessionId: string | null;
    notes: string[];
    qualityEvidence?: ReturnType<typeof extractQualityEvidence>;
    turns: TurnTranscript[];
  }>;
}

interface QualityEvidenceCheck {
  label: string;
  passed: boolean;
  details: string;
}

interface QualityEvidenceSummary {
  selectedDomainSkills: string[];
  loadedSkillSections: unknown[];
  readIntents: unknown[];
  retrievedContextCounts: {
    total: number;
    bySourceType: Record<string, number>;
  };
  minimalContractChecks: QualityEvidenceCheck[];
  skillBehaviorChecks: QualityEvidenceCheck[];
  llmJudgeSummary: {
    status: string;
    summary: string;
  };
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

function scenarioQualityGateLabel(scenarioId: string) {
  try {
    return getScenarioById(scenarioId).qualityGate;
  } catch {
    return null;
  }
}

function getScenarioDebugPayload(outcome: ScenarioOutcome) {
  for (let index = outcome.turns.length - 1; index >= 0; index -= 1) {
    const body = outcome.turns[index]?.response.body;
    if (!body || typeof body !== 'object') {
      continue;
    }

    const debug = (body as { debug?: unknown }).debug;
    if (debug && typeof debug === 'object') {
      return debug as {
        selectedDomainSkills?: unknown;
        loadedSkillSections?: unknown;
        readIntents?: unknown;
        retrievedContext?: unknown;
        responseContract?: unknown;
        minimalContractChecks?: unknown;
        skillBehaviorChecks?: unknown;
        llmJudgeSummary?: unknown;
      };
    }
  }

  return null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function extractQualityEvidence(outcome: ScenarioOutcome): QualityEvidenceSummary | null {
  const debug = getScenarioDebugPayload(outcome);
  if (!debug) {
    return null;
  }

  const selectedDomainSkills = arrayValue(debug.selectedDomainSkills).filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
  const loadedSkillSections = arrayValue(debug.loadedSkillSections);
  const readIntents = arrayValue(debug.readIntents);
  const retrievedContext = arrayValue(debug.retrievedContext);
  const responseContract = debug.responseContract && typeof debug.responseContract === 'object'
    ? debug.responseContract as Record<string, unknown>
    : {};

  const bySourceType: Record<string, number> = {};
  for (const entry of retrievedContext) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const sourceType = (entry as { sourceType?: unknown }).sourceType;
    if (typeof sourceType === 'string' && sourceType.trim().length > 0) {
      bySourceType[sourceType] = (bySourceType[sourceType] ?? 0) + 1;
    }
  }

  const minimalContractChecks = Array.isArray(debug.minimalContractChecks)
    ? redactDeep(debug.minimalContractChecks) as QualityEvidenceCheck[]
    : [
        {
          label: 'structure',
          passed: typeof responseContract.structure === 'string',
          details: typeof responseContract.structure === 'string' ? String(responseContract.structure) : 'missing',
        },
        {
          label: 'primaryMove',
          passed: typeof responseContract.primaryMove === 'string',
          details: typeof responseContract.primaryMove === 'string' ? String(responseContract.primaryMove) : 'missing',
        },
        {
          label: 'followUpMove',
          passed: typeof responseContract.followUpMove === 'string',
          details: typeof responseContract.followUpMove === 'string' ? String(responseContract.followUpMove) : 'missing',
        },
      ];

  const skillBehaviorChecks = Array.isArray(debug.skillBehaviorChecks)
    ? redactDeep(debug.skillBehaviorChecks) as QualityEvidenceCheck[]
    : [
        {
          label: 'selectedDomainSkills',
          passed: selectedDomainSkills.length > 0,
          details: `${selectedDomainSkills.length} selected`,
        },
        {
          label: 'loadedSkillSections',
          passed: loadedSkillSections.length > 0,
          details: `${loadedSkillSections.length} loaded`,
        },
        {
          label: 'retrievedContext',
          passed: retrievedContext.length > 0,
          details: `${retrievedContext.length} retrieved`,
        },
      ];

  const llmJudgeSummary = debug.llmJudgeSummary && typeof debug.llmJudgeSummary === 'object'
    ? redactDeep(debug.llmJudgeSummary) as QualityEvidenceSummary['llmJudgeSummary']
    : {
        status: 'not_run',
        summary: 'LLM judge not enabled for this run.',
      };

  return {
    selectedDomainSkills: redactDeep(selectedDomainSkills),
    loadedSkillSections: redactDeep(loadedSkillSections),
    readIntents: redactDeep(readIntents),
    retrievedContextCounts: {
      total: retrievedContext.length,
      bySourceType,
    },
    minimalContractChecks,
    skillBehaviorChecks,
    llmJudgeSummary,
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

const SCENARIO_ROW_HEADER = '| Scenario | Quality gate | Outcome | Category | Phase | Control-plane usable | Session | Summary |';
const SCENARIO_ROW_DIVIDER = '|---|---|---|---|---|---|---|---|';

function scenarioCategoryLabel(outcome: ScenarioOutcome) {
  return outcome.failureCategory ? `\`${outcome.failureCategory}\`` : '_none_';
}

function scenarioPhaseLabel(outcome: ScenarioOutcome) {
  return outcome.failedPhase ? `\`${outcome.failedPhase}\`` : '_none_';
}

function scenarioSessionLabel(outcome: ScenarioOutcome) {
  return outcome.sessionId ? `\`${redactSensitiveText(outcome.sessionId)}\`` : '_none_';
}

function scenarioQualityGateCell(scenarioId: string) {
  const qualityGate = scenarioQualityGateLabel(scenarioId);
  return qualityGate ? `\`${qualityGate}\`` : '_unknown_';
}

function renderScenarioRow(outcome: ScenarioOutcome) {
  return [
    `\`${outcome.scenarioId}\``,
    scenarioQualityGateCell(outcome.scenarioId),
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
    lines.push('| _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ |');
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
    renderGroupedScenarioSection('Transport Failures', byCategory(['transport'])),
    renderGroupedScenarioSection('Control-Plane Failures', byCategory(['control_plane'])),
    renderGroupedScenarioSection('Skill-Routing Failures', byCategory(['skill_routing'])),
    renderGroupedScenarioSection('Read-Planning Failures', byCategory(['read_planning'])),
    renderGroupedScenarioSection('Agent-Contract Failures', byCategory(['agent_contract'])),
    renderGroupedScenarioSection('Skill-Behavior Failures', byCategory(['skill_behavior'])),
    renderGroupedScenarioSection('Response-Quality Failures', byCategory(['response_quality'])),
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

function renderCheckList(checks: QualityEvidenceCheck[]) {
  if (checks.length === 0) {
    return '_none_';
  }

  return checks
    .map((check) => `${check.label}=${check.passed ? 'pass' : 'fail'} (${check.details})`)
    .map((entry) => `\`${markdownTableCell(entry)}\``)
    .join(', ');
}

function renderQualityEvidenceSection(rollup: RunRollup) {
  const scenariosWithEvidence = rollup.scenarioOutcomes
    .map((outcome) => ({ outcome, evidence: extractQualityEvidence(outcome) }))
    .filter((entry): entry is { outcome: ScenarioOutcome; evidence: QualityEvidenceSummary } => entry.evidence !== null);

  const lines = [
    '## Quality Evidence',
    '',
    '| Scenario | Quality gate | selectedDomainSkills | loadedSkillSections | readIntents | retrievedContext counts | minimalContractChecks | skillBehaviorChecks | llmJudgeSummary |',
    '|---|---|---|---|---|---|---|---|---|',
  ];

  if (scenariosWithEvidence.length === 0) {
    lines.push('| _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ |');
    return lines.join('\n');
  }

  for (const { outcome, evidence } of scenariosWithEvidence) {
    const retrievedContextCounts = [
      `total=${evidence.retrievedContextCounts.total}`,
      ...Object.entries(evidence.retrievedContextCounts.bySourceType).map(([sourceType, count]) => `${sourceType}=${count}`),
    ].join(', ');

    lines.push(`| ${
      [
        `\`${outcome.scenarioId}\``,
        scenarioQualityGateCell(outcome.scenarioId),
        markdownTableCell(evidence.selectedDomainSkills.join(', ') || '_none_'),
        markdownTableCell(String(evidence.loadedSkillSections.length)),
        markdownTableCell(String(evidence.readIntents.length)),
        markdownTableCell(retrievedContextCounts),
        renderCheckList(evidence.minimalContractChecks),
        renderCheckList(evidence.skillBehaviorChecks),
        markdownTableCell(`${evidence.llmJudgeSummary.status}: ${evidence.llmJudgeSummary.summary}`),
      ].join(' | ')
    } |`);
  }

  return lines.join('\n');
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
    renderQualityEvidenceSection(rollup),
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
    'control_plane',
    'skill_routing',
    'read_planning',
    'agent_contract',
    'skill_behavior',
    'response_quality',
    'transport',
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
      ...(scenarioQualityGateLabel(scenarioOutcome.scenarioId)
        ? { qualityGate: scenarioQualityGateLabel(scenarioOutcome.scenarioId) ?? undefined }
        : {}),
      outcome: scenarioOutcome.outcome,
      summary: redactStructuredText(scenarioOutcome.summary),
      ...(scenarioOutcome.failureCategory ? { failureCategory: scenarioOutcome.failureCategory } : {}),
      ...(scenarioOutcome.failedPhase ? { failedPhase: scenarioOutcome.failedPhase } : {}),
      usableForControlPlaneJudgment: scenarioOutcome.usableForControlPlaneJudgment,
      bootstrapAttempts: redactDeep(scenarioOutcome.bootstrapAttempts),
      chatAttempts: redactDeep(scenarioOutcome.chatAttempts),
      sessionId: scenarioOutcome.sessionId ? redactSensitiveText(scenarioOutcome.sessionId) : null,
      notes: scenarioOutcome.notes.map((note) => redactStructuredText(note)),
      ...(extractQualityEvidence(scenarioOutcome)
        ? { qualityEvidence: redactDeep(extractQualityEvidence(scenarioOutcome)) }
        : {}),
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
