import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bootstrapRealApiSession,
  type AllowedBootstrapPayload,
  type BootstrapOutcome,
  type BootstrapSuccessResult,
} from './chatbot-v3-real-api-dogfood/bootstrap.ts';
import { parseDogfoodConfig, requireDogfoodRuntimeDebugSecret } from './chatbot-v3-real-api-dogfood/config.ts';
import { createDogfoodHttpClient, type DogfoodHttpClient } from './chatbot-v3-real-api-dogfood/http-client.ts';

interface NaturalSession {
  id: string;
  title: string;
  sourceFile: string;
  primaryStressor: string | null;
  expectedPressurePoints: string | null;
  turns: string[];
}

interface TurnObservation {
  sessionId: string;
  title: string;
  sourceFile: string;
  turnIndex: number;
  userInput: string;
  request: {
    url: string;
    body: unknown;
    headers: Record<string, string>;
  };
  response: {
    status: number;
    durationMs: number;
    body: unknown;
    bodyText: string | null;
    headers: Record<string, string>;
  };
  observability: {
    journey: unknown;
    runtimeDebug: unknown;
    nodeEvidence: unknown;
    responseText: string;
    warnings: string[];
  };
}

interface SessionObservation {
  session: NaturalSession;
  bootstrap: BootstrapOutcome;
  turns: TurnObservation[];
  warnings: string[];
  outcome: 'PASS' | 'WARN' | 'FAIL';
}

const DEFAULT_SESSION_GLOB = /^2026-04-29-chatbot-v3-natural-language-sessions-batch-\d+\.md$/;
const DEFAULT_TURN_TIMEOUT_MS = 90_000;
const DEFAULT_SLOW_TURN_MS = 45_000;

function getArgValue(argv: string[], flag: string) {
  const withEquals = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (withEquals) {
    return withEquals.slice(flag.length + 1);
  }

  const index = argv.indexOf(flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return undefined;
}

function hasFlag(argv: string[], flag: string) {
  return argv.includes(flag);
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${raw} is not a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${raw} is not a non-negative integer.`);
  }

  return parsed;
}

function parseSessionFiles(docsDir: string): NaturalSession[] {
  const files = readdirSync(docsDir)
    .filter((fileName) => DEFAULT_SESSION_GLOB.test(fileName))
    .sort();

  const sessions: NaturalSession[] = [];
  for (const fileName of files) {
    const fullPath = join(docsDir, fileName);
    const text = readFileSync(fullPath, 'utf8');
    const chunks = text
      .split(/(?=^## Session \d+:)/m)
      .filter((chunk) => /^## Session \d+:/m.test(chunk));

    for (const chunk of chunks) {
      const heading = chunk.match(/^## Session (\d+):\s*(.+)$/m);
      if (!heading) {
        continue;
      }

      const turns = Array.from(chunk.matchAll(/^\s*\d+\.\s*User:\s*(.+)$/gm))
        .map((match) => match[1]?.trim() ?? '')
        .filter(Boolean);

      sessions.push({
        id: heading[1] ?? '',
        title: heading[2]?.trim() ?? '',
        sourceFile: fullPath,
        primaryStressor: matchBullet(chunk, 'Primary stressor'),
        expectedPressurePoints: matchBullet(chunk, 'Expected pressure points'),
        turns,
      });
    }
  }

  return sessions;
}

function matchBullet(text: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^- ${escapedLabel}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function slugifyEmailPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function buildAllowedOnboardingPayload({
  site,
  session,
  runTimestamp,
  runNonce,
}: {
  site: string;
  session: NaturalSession;
  runTimestamp: string;
  runNonce: string;
}): AllowedBootstrapPayload {
  const siteSlug = slugifyEmailPart(site) || 'site';
  const sessionSlug = slugifyEmailPart(`natural-${session.id}`) || 'session';
  const timestampSlug = slugifyEmailPart(runTimestamp) || 'run';
  const nonceSlug = slugifyEmailPart(runNonce) || 'nonce';

  return {
    email: `dogfood+${siteSlug}-${sessionSlug}-${timestampSlug}-${nonceSlug}@example.com`,
    name: `Natural Session ${session.id}`,
    preferredLanguage: 'en',
    destination: 'Japan',
  };
}

function extractResponseText(body: unknown) {
  if (!body || typeof body !== 'object') {
    return typeof body === 'string' ? body : '';
  }

  const candidate = body as {
    message?: unknown;
    text?: unknown;
    assistantMessage?: unknown;
    messages?: Array<{ text?: unknown; content?: unknown }>;
  };

  if (typeof candidate.message === 'string') {
    return candidate.message;
  }
  if (typeof candidate.text === 'string') {
    return candidate.text;
  }
  if (typeof candidate.assistantMessage === 'string') {
    return candidate.assistantMessage;
  }
  if (Array.isArray(candidate.messages)) {
    return candidate.messages
      .map((message) => typeof message.text === 'string'
        ? message.text
        : typeof message.content === 'string'
          ? message.content
          : '')
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function extractRuntimeDebug(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  return (body as { runtimeDebug?: unknown }).runtimeDebug ?? null;
}

function extractJourney(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as { journey?: unknown; journeySummary?: unknown };
  return candidate.journeySummary ?? candidate.journey ?? null;
}

function summarizeNodeEvidence(runtimeDebug: unknown) {
  if (!runtimeDebug || typeof runtimeDebug !== 'object') {
    return null;
  }

  const debug = runtimeDebug as Record<string, unknown>;
  return {
    traceId: debug.traceId,
    idempotencyKey: debug.idempotencyKey,
    event: debug.event,
    lastDispatchSource: debug.lastDispatchSource,
    replayLineage: debug.replayLineage,
    selectedDomainSkills: debug.selectedDomainSkills,
    loadedSkillSections: debug.loadedSkillSections,
    readIntents: debug.readIntents,
    retrievedContext: debug.retrievedContext,
    retrievedContextCount: debug.retrievedContextCount,
    responseContract: debug.responseContract,
    minimalContractChecks: debug.minimalContractChecks,
    skillBehaviorChecks: debug.skillBehaviorChecks,
  };
}

function buildWarnings({
  status,
  durationMs,
  slowTurnMs,
  body,
  userInput,
}: {
  status: number;
  durationMs: number;
  slowTurnMs: number;
  body: unknown;
  userInput: string;
}) {
  const warnings: string[] = [];
  const runtimeDebug = extractRuntimeDebug(body);
  const responseText = extractResponseText(body);

  if (status >= 400 || status === 0) {
    warnings.push(`http_status=${status}`);
  }
  if (durationMs > slowTurnMs) {
    warnings.push(`slow_turn_ms=${durationMs}`);
  }
  if (!runtimeDebug) {
    warnings.push('missing_runtimeDebug');
  }
  if (!responseText.trim()) {
    warnings.push('missing_response_text');
  }
  if (!extractJourney(body)) {
    warnings.push('missing_journey');
  }
  for (const failure of extractRuntimeCheckFailures(runtimeDebug)) {
    warnings.push(failure);
  }
  if (looksMostlyEnglish(userInput) && containsCjk(responseText)) {
    warnings.push('language_mismatch_user_en_response_cjk');
  }

  return warnings;
}

function extractRuntimeCheckFailures(runtimeDebug: unknown) {
  if (!runtimeDebug || typeof runtimeDebug !== 'object') {
    return [];
  }

  const debug = runtimeDebug as {
    minimalContractChecks?: unknown;
    skillBehaviorChecks?: unknown;
  };
  return [
    ...extractCheckFailures('minimal_contract', debug.minimalContractChecks),
    ...extractCheckFailures('skill_behavior', debug.skillBehaviorChecks),
  ];
}

function extractCheckFailures(prefix: string, checks: unknown) {
  if (!Array.isArray(checks)) {
    return [];
  }

  return checks.flatMap((check, index) => {
    if (!check || typeof check !== 'object') {
      return [];
    }
    const candidate = check as { id?: unknown; result?: unknown; severity?: unknown; reason?: unknown };
    if (candidate.result === 'pass') {
      return [];
    }
    const id = typeof candidate.id === 'string' ? candidate.id : `check_${index + 1}`;
    const severity = typeof candidate.severity === 'string' ? candidate.severity : 'unknown';
    const reason = typeof candidate.reason === 'string' && candidate.reason.trim()
      ? `:${candidate.reason.trim().replace(/\s+/g, '_').slice(0, 80)}`
      : '';
    return [`${prefix}_${id}_${String(candidate.result)}_${severity}${reason}`];
  });
}

function looksMostlyEnglish(value: string) {
  const asciiLetters = (value.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (value.match(/[\u3400-\u9fff]/g) ?? []).length;
  return asciiLetters >= 12 && cjk === 0;
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function redactedChatHeaders(client: DogfoodHttpClient) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-medora-site': client.site,
  };

  if (process.env.CHATBOT_V3_DOGFOOD_DEBUG_SECRET?.trim()) {
    headers['x-chatbot-v3-dogfood-debug'] = '<redacted>';
  }
  if (client.cookieJar.getRedactedCookies().length > 0) {
    headers.cookie = '<redacted>';
  }

  return headers;
}

function appendJsonl(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: 'a' });
}

async function runTurn({
  client,
  bootstrap,
  session,
  turnIndex,
  userInput,
  timeoutMs,
  slowTurnMs,
}: {
  client: DogfoodHttpClient;
  bootstrap: BootstrapSuccessResult;
  session: NaturalSession;
  turnIndex: number;
  userInput: string;
  timeoutMs: number;
  slowTurnMs: number;
}): Promise<TurnObservation> {
  const requestBody = {
    sessionId: bootstrap.widgetChatTargetSessionId,
    message: userInput,
  };
  const startedAt = performance.now();

  const exchange = await client.request({
    method: 'POST',
    path: '/api/v3/chatbot/chat',
    body: requestBody,
    timeoutMs,
    headers: {
      'x-chatbot-v3-dogfood-debug': requireDogfoodRuntimeDebugSecret(),
    },
  });
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const runtimeDebug = extractRuntimeDebug(exchange.response.body);

  return {
    sessionId: session.id,
    title: session.title,
    sourceFile: session.sourceFile,
    turnIndex,
    userInput,
    request: {
      url: exchange.url,
      body: requestBody,
      headers: redactedChatHeaders(client),
    },
    response: {
      status: exchange.response.status,
      durationMs,
      body: exchange.response.body,
      bodyText: exchange.response.bodyText,
      headers: exchange.response.redactedHeaders,
    },
    observability: {
      journey: extractJourney(exchange.response.body),
      runtimeDebug,
      nodeEvidence: summarizeNodeEvidence(runtimeDebug),
      responseText: extractResponseText(exchange.response.body),
      warnings: buildWarnings({
        status: exchange.response.status,
        durationMs,
        slowTurnMs,
        body: exchange.response.body,
        userInput,
      }),
    },
  };
}

async function runSession({
  baseUrl,
  site,
  runTimestamp,
  runNonce,
  session,
  timeoutMs,
  slowTurnMs,
  artifactPaths,
  printJsonl,
}: {
  baseUrl: string;
  site: string;
  runTimestamp: string;
  runNonce: string;
  session: NaturalSession;
  timeoutMs: number;
  slowTurnMs: number;
  artifactPaths: ReturnType<typeof buildArtifactPaths>;
  printJsonl: boolean;
}): Promise<SessionObservation> {
  const client = createDogfoodHttpClient({ baseUrl, site });
  const bootstrap = await bootstrapRealApiSession({
    client,
    scenarioId: `natural-${session.id}`,
    bootstrapMode: 'chat_allowed',
    timestamp: runTimestamp,
    onboardingPayload: buildAllowedOnboardingPayload({
      site,
      session,
      runTimestamp,
      runNonce,
    }),
    maxAttempts: 2,
  });

  const turns: TurnObservation[] = [];
  const warnings: string[] = [];

  if (bootstrap.bootstrapMode !== 'chat_allowed') {
    warnings.push(`bootstrap_failed=${bootstrap.bootstrapMode}`);
    const failed: SessionObservation = {
      session,
      bootstrap,
      turns,
      warnings,
      outcome: 'FAIL',
    };
    appendJsonl(artifactPaths.sessionsJsonl, failed);
    if (printJsonl) {
      console.log(JSON.stringify({
        type: 'session_failed',
        sessionId: session.id,
        title: session.title,
        warnings,
      }));
    }
    return failed;
  }

  for (const [turnIndex, userInput] of session.turns.entries()) {
    try {
      const observation = await runTurn({
        client,
        bootstrap,
        session,
        turnIndex,
        userInput,
        timeoutMs,
        slowTurnMs,
      });
      turns.push(observation);
      appendJsonl(artifactPaths.turnsJsonl, observation);
      appendJsonl(artifactPaths.nodeEvidenceJsonl, {
        sessionId: observation.sessionId,
        turnIndex: observation.turnIndex,
        userInput: observation.userInput,
        nodeEvidence: observation.observability.nodeEvidence,
        responseText: observation.observability.responseText,
      });

      if (observation.observability.warnings.length > 0) {
        warnings.push(`turn_${turnIndex + 1}:${observation.observability.warnings.join(',')}`);
      }

      if (printJsonl) {
        console.log(JSON.stringify({
          type: 'turn',
          sessionId: session.id,
          turnIndex: turnIndex + 1,
          status: observation.response.status,
          durationMs: observation.response.durationMs,
          journey: observation.observability.journey,
          warnings: observation.observability.warnings,
          nodeEvidence: observation.observability.nodeEvidence,
          userInput,
          responseText: observation.observability.responseText,
        }));
      }

      if (observation.response.status >= 400) {
        break;
      }
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      warnings.push(`turn_${turnIndex + 1}:transport_error:${warning}`);
      appendJsonl(artifactPaths.turnsJsonl, {
        sessionId: session.id,
        turnIndex,
        userInput,
        transportError: warning,
      });
      if (printJsonl) {
        console.log(JSON.stringify({
          type: 'turn_transport_error',
          sessionId: session.id,
          turnIndex: turnIndex + 1,
          warning,
        }));
      }
      break;
    }
  }

  const outcome = warnings.some((warning) => warning.includes('http_status=') || warning.includes('transport_error') || warning.includes('bootstrap_failed'))
    ? 'FAIL'
    : warnings.length > 0
      ? 'WARN'
      : 'PASS';
  const observation: SessionObservation = {
    session,
    bootstrap,
    turns,
    warnings,
    outcome,
  };
  appendJsonl(artifactPaths.sessionsJsonl, observation);
  return observation;
}

function buildArtifactPaths(workspaceRoot: string, runTimestamp: string) {
  const artifactDir = resolve(workspaceRoot, 'artifacts', 'chatbot-v3-natural-session-dogfood', runTimestamp);
  mkdirSync(artifactDir, { recursive: true });
  return {
    artifactDir,
    turnsJsonl: join(artifactDir, 'turns.jsonl'),
    sessionsJsonl: join(artifactDir, 'sessions.jsonl'),
    nodeEvidenceJsonl: join(artifactDir, 'node-evidence.jsonl'),
    metadataJson: join(artifactDir, 'run-metadata.json'),
    reportMd: join(artifactDir, 'report.md'),
  };
}

function writeReport({
  artifactPaths,
  sessions,
  observations,
}: {
  artifactPaths: ReturnType<typeof buildArtifactPaths>;
  sessions: NaturalSession[];
  observations: SessionObservation[];
}) {
  const passCount = observations.filter((observation) => observation.outcome === 'PASS').length;
  const warnCount = observations.filter((observation) => observation.outcome === 'WARN').length;
  const failCount = observations.filter((observation) => observation.outcome === 'FAIL').length;
  const turnCount = observations.reduce((sum, observation) => sum + observation.turns.length, 0);
  const durations = observations.flatMap((observation) => observation.turns.map((turn) => turn.response.durationMs));
  const sortedDurations = [...durations].sort((left, right) => left - right);
  const p95 = sortedDurations.length > 0
    ? sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * 0.95))]
    : 0;

  const lines = [
    '# Chatbot V3 Natural Session Dogfood Report',
    '',
    `- Sessions planned: ${sessions.length}`,
    `- Sessions executed: ${observations.length}`,
    `- Turns executed: ${turnCount}`,
    `- PASS/WARN/FAIL: ${passCount}/${warnCount}/${failCount}`,
    `- p95 turn latency: ${p95} ms`,
    '',
    '## Files',
    '',
    `- Full turn transcript: ${basename(artifactPaths.turnsJsonl)}`,
    `- Session rollup: ${basename(artifactPaths.sessionsJsonl)}`,
    `- Node evidence projection: ${basename(artifactPaths.nodeEvidenceJsonl)}`,
    '',
    '## Session Rollup',
    '',
    '| Session | Outcome | Turns | Warnings |',
    '|---|---:|---:|---|',
    ...observations.map((observation) => [
      `| ${observation.session.id} ${observation.session.title}`,
      observation.outcome,
      String(observation.turns.length),
      observation.warnings.length > 0 ? observation.warnings.join('<br>') : '-',
      '|',
    ].join(' | ')),
    '',
  ];

  writeFileSync(artifactPaths.reportMd, `${lines.join('\n')}\n`);
}

async function run() {
  requireDogfoodRuntimeDebugSecret();
  const argv = process.argv.slice(2);
  const config = parseDogfoodConfig(argv);
  const workspaceRoot = process.cwd();
  const docsDir = resolve(workspaceRoot, 'docs', 'analysis');
  const limit = getArgValue(argv, '--limit')
    ? parsePositiveInt(getArgValue(argv, '--limit'), 100)
    : null;
  const offset = parseNonNegativeInt(getArgValue(argv, '--offset'), 0);
  const timeoutMs = parsePositiveInt(getArgValue(argv, '--turn-timeout-ms'), DEFAULT_TURN_TIMEOUT_MS);
  const slowTurnMs = parsePositiveInt(getArgValue(argv, '--slow-turn-ms'), DEFAULT_SLOW_TURN_MS);
  const printJsonl = !hasFlag(argv, '--quiet');

  const sessions = parseSessionFiles(docsDir);
  const selectedSessions = sessions.slice(offset, limit === null ? undefined : offset + limit);
  const runNonce = randomUUID();
  const artifactPaths = buildArtifactPaths(workspaceRoot, config.runTimestamp);
  writeFileSync(artifactPaths.metadataJson, JSON.stringify({
    artifactSchemaVersion: 1,
    runTimestamp: config.runTimestamp,
    baseUrl: config.baseUrl,
    site: config.site,
    sourceFiles: Array.from(new Set(sessions.map((session) => session.sourceFile))),
    plannedSessionCount: sessions.length,
    executedSessionCount: selectedSessions.length,
    offset,
    limit,
    timeoutMs,
    slowTurnMs,
  }, null, 2));

  const observations: SessionObservation[] = [];
  for (const session of selectedSessions) {
    console.log(JSON.stringify({
      type: 'session_start',
      sessionId: session.id,
      title: session.title,
      turns: session.turns.length,
      sourceFile: session.sourceFile,
    }));
    const observation = await runSession({
      baseUrl: config.baseUrl,
      site: config.site,
      runTimestamp: config.runTimestamp,
      runNonce,
      session,
      timeoutMs,
      slowTurnMs,
      artifactPaths,
      printJsonl,
    });
    observations.push(observation);
    console.log(JSON.stringify({
      type: 'session_done',
      sessionId: session.id,
      outcome: observation.outcome,
      turns: observation.turns.length,
      warnings: observation.warnings,
    }));
  }

  writeReport({
    artifactPaths,
    sessions: selectedSessions,
    observations,
  });

  console.log(`Artifacts written to ${artifactPaths.artifactDir}`);
  const failed = observations.filter((observation) => observation.outcome === 'FAIL');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isMain) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
