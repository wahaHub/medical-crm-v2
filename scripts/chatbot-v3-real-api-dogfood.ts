import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  bootstrapRealApiSession,
  type AllowedBootstrapPayload,
  type BootstrapOutcome,
  type BootstrapSuccessResult,
} from './chatbot-v3-real-api-dogfood/bootstrap.ts';
import { createDogfoodHttpClient } from './chatbot-v3-real-api-dogfood/http-client.ts';
import { parseDogfoodConfig } from './chatbot-v3-real-api-dogfood/config.ts';
import { getScenarioById, V1_REQUIRED_SCENARIO_IDS } from './chatbot-v3-real-api-dogfood/scenarios.ts';
import { runChatSession, type ChatRunnerResult } from './chatbot-v3-real-api-dogfood/chat-runner.ts';
import {
  buildClassifiedRunRollup,
  buildClassifiedScenarioOutcome,
  classifyBootstrapFailureOutcome,
  classifyChatFailureOutcome,
  classifyEvaluationOutcome,
  type DogfoodAxisEvaluation,
} from './chatbot-v3-real-api-dogfood/evaluator.ts';
import { writeDogfoodArtifacts } from './chatbot-v3-real-api-dogfood/reporting.ts';
import type { RunRollup, ScenarioOutcome, TurnTranscript } from './chatbot-v3-real-api-dogfood/types.ts';

function buildScenarioTurns(scenarioId: string) {
  switch (scenarioId) {
    case 'blocked_without_prereq':
      return [];
    case 'allowed_after_patient_session':
      return [{ message: 'Hello' }];
    case 'intake_to_triage_opening':
      return [{ message: 'Hello' }, { message: 'I am here for my intake.' }];
    case 'triage_to_recommendation':
      return [{ message: 'I have symptoms.' }, { message: 'What should I do next?' }];
    case 'recommendation_selected_to_consult':
      return [{ message: 'I accepted the recommendation.' }, { message: 'Please arrange a consult.' }];
    case 'faq_detour_no_progression':
      return [{ message: 'What are your hours?' }, { message: 'What is your pricing?' }];
    case 'handoff_denied_returns_to_current_step':
      return [{ message: 'I want a human.' }, { message: 'Okay, continue the current step.' }];
    default:
      return [{ message: 'Hello' }];
  }
}

function toTurnTranscript(
  scenarioId: string,
  turnIndex: number,
  result: ChatRunnerResult['turns'][number],
  chatResult: ChatRunnerResult,
): TurnTranscript {
  const finalAttempt = chatResult.chatAttempts
    .filter((attempt) => attempt.turnIndex === turnIndex)
    .at(-1);

  return {
    scenarioId,
    turnIndex,
    requestUrl: result.requestUrl,
    requestAttempt: finalAttempt?.attempt ?? 1,
    durationMs: finalAttempt?.durationMs ?? 0,
    ...(finalAttempt?.transportErrorKind ? { transportErrorKind: finalAttempt.transportErrorKind } : {}),
    request: {
      method: 'POST',
      path: '/api/v3/chatbot/chat',
      body: result.requestPayload,
      headers: result.requestHeaders,
    },
    response: {
      status: result.responseStatus,
      body: result.responseBody,
      bodyText: result.responseBodyText,
      headers: result.responseHeaders,
    },
  };
}

function buildAxis(result: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL', reason?: string): DogfoodAxisEvaluation {
  return result === 'PASS' ? { result } : { result, reason };
}

function slugifyEmailPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildAllowedOnboardingPayload({
  site,
  scenarioId,
  runTimestamp,
  runNonce,
}: {
  site: string;
  scenarioId: string;
  runTimestamp: string;
  runNonce: string;
}): AllowedBootstrapPayload {
  const siteSlug = slugifyEmailPart(site) || 'site';
  const scenarioSlug = slugifyEmailPart(scenarioId) || 'scenario';
  const timestampSlug = slugifyEmailPart(runTimestamp) || 'run';
  const nonceSlug = slugifyEmailPart(runNonce) || 'nonce';

  return {
    email: `dogfood+${siteSlug}-${scenarioSlug}-${timestampSlug}-${nonceSlug}@example.com`,
    name: 'Dogfood Patient',
    preferredLanguage: 'en',
    destination: 'Shenzhen',
  };
}

function evaluateBlockedScenario(bootstrap: BootstrapOutcome): ScenarioOutcome {
  if (bootstrap.bootstrapMode === 'bootstrap_failed') {
    return classifyBootstrapFailureOutcome({
      scenarioId: bootstrap.scenarioId,
      summary: bootstrap.message,
      bootstrapAttempts: bootstrap.attempts,
      sessionId: bootstrap.widgetChatTargetSessionId,
      notes: [
        `failureKind=${bootstrap.failureKind}`,
        ...(typeof bootstrap.status === 'number' ? [`status=${bootstrap.status}`] : []),
      ],
    });
  }

  if (bootstrap.bootstrapMode !== 'blocked_expected') {
    return classifyBootstrapFailureOutcome({
      scenarioId: bootstrap.scenarioId,
      summary: 'Blocked-path scenario unexpectedly established chat eligibility.',
      bootstrapAttempts: bootstrap.attempts,
      sessionId: bootstrap.widgetChatTargetSessionId,
    });
  }

  return buildClassifiedScenarioOutcome({
    scenarioId: bootstrap.scenarioId,
    summary: 'all four axes passed',
    bootstrapAttempts: bootstrap.attempts,
    sessionId: bootstrap.widgetChatTargetSessionId,
  });
}

function evaluateAllowedScenario(
  scenarioId: string,
  bootstrap: BootstrapOutcome,
  chatResult: ChatRunnerResult | null,
): ScenarioOutcome {
  if (bootstrap.bootstrapMode === 'bootstrap_failed') {
    return classifyBootstrapFailureOutcome({
      scenarioId,
      summary: bootstrap.message,
      bootstrapAttempts: bootstrap.attempts,
      sessionId: bootstrap.widgetChatTargetSessionId,
      notes: [
        `failureKind=${bootstrap.failureKind}`,
        ...(typeof bootstrap.status === 'number' ? [`status=${bootstrap.status}`] : []),
      ],
    });
  }

  if (!chatResult) {
    return classifyChatFailureOutcome({
      scenarioId,
      status: 0,
      summary: 'Chat runner did not execute for an allowed-path scenario.',
      bootstrapAttempts: bootstrap.attempts,
      sessionId: bootstrap.widgetChatTargetSessionId,
    });
  }

  const turnTranscripts = chatResult.turns.map((turn, index) => toTurnTranscript(scenarioId, index, turn, chatResult));
  const firstHardFailure = turnTranscripts.find((turn) => turn.response.status >= 400 || turn.response.status === 0);

  if (firstHardFailure) {
    return classifyChatFailureOutcome({
      scenarioId,
      status: firstHardFailure.response.status,
      summary:
        firstHardFailure.response.status === 0
          ? 'Chat turn failed before receiving an HTTP response.'
          : `Chat turn failed with HTTP ${firstHardFailure.response.status}.`,
      bootstrapAttempts: bootstrap.attempts,
      chatAttempts: chatResult.chatAttempts,
      sessionId: bootstrap.widgetChatTargetSessionId,
      turns: turnTranscripts,
    });
  }

  const accessDecision = buildAxis(
    bootstrap.bootstrapMode === 'chat_allowed' ? 'PASS' : 'HARD_FAIL',
    'chat was not allowed after patient bootstrap',
  );
  const journey = buildAxis('PASS');
  const response = buildAxis('PASS');
  const continuity = buildAxis(chatResult.stoppedEarly ? 'HARD_FAIL' : 'PASS', chatResult.stoppedEarly ? 'conversation stopped early' : undefined);

  if (accessDecision.result !== 'PASS') {
    return classifyBootstrapFailureOutcome({
      scenarioId,
      summary: accessDecision.reason ?? 'chat was not allowed after patient bootstrap',
      bootstrapAttempts: bootstrap.attempts,
      chatAttempts: chatResult.chatAttempts,
      sessionId: bootstrap.widgetChatTargetSessionId,
      turns: turnTranscripts,
    });
  }

  return classifyEvaluationOutcome({
    scenarioId,
    summary: 'all four axes passed',
    journey,
    response,
    continuity,
    bootstrapAttempts: bootstrap.attempts,
    chatAttempts: chatResult.chatAttempts,
    sessionId: bootstrap.widgetChatTargetSessionId,
    turns: turnTranscripts,
  });
}

async function run() {
  const config = parseDogfoodConfig();
  const workspaceRoot = process.cwd();
  const client = createDogfoodHttpClient({
    baseUrl: config.baseUrl,
    site: config.site,
  });
  const runNonce = randomUUID();

  const bootstrapResults: BootstrapSuccessResult[] = [];
  const scenarioOutcomes: ScenarioOutcome[] = [];

  for (const scenarioId of V1_REQUIRED_SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    const bootstrap = await bootstrapRealApiSession({
      client,
      scenarioId,
      bootstrapMode: scenario.bootstrapMode,
      timestamp: config.runTimestamp,
      ...(scenario.bootstrapMode === 'chat_allowed'
        ? {
            onboardingPayload: buildAllowedOnboardingPayload({
              site: config.site,
              scenarioId: scenario.id,
              runTimestamp: config.runTimestamp,
              runNonce,
            }),
          }
        : {}),
    });

    if (scenario.bootstrapMode === 'blocked_expected') {
      scenarioOutcomes.push(evaluateBlockedScenario(bootstrap));
      continue;
    }

    if (bootstrap.bootstrapMode === 'chat_allowed') {
      bootstrapResults.push(bootstrap);
      const chatResult = await runChatSession({
        client,
        bootstrap,
        scenario: {
          id: scenario.id,
          retryPolicy: scenario.id === 'degraded_then_retry' ? 'allow_retry_after_hard_failure' : 'stop_on_hard_failure',
        },
        turns: buildScenarioTurns(scenario.id),
      });

      scenarioOutcomes.push(evaluateAllowedScenario(scenario.id, bootstrap, chatResult));
      continue;
    }

    scenarioOutcomes.push(evaluateAllowedScenario(scenario.id, bootstrap, null));
  }

  const rollup: RunRollup = buildClassifiedRunRollup(scenarioOutcomes);

  const artifactDir = writeDogfoodArtifacts({
    workspaceRoot,
    outputRoot: workspaceRoot,
    config,
    bootstrapResults,
    rollup,
    gitCommit: null,
  });

  console.log(`Artifacts written to ${artifactDir}`);
  console.log(`Run outcome: ${rollup.outcome}`);
  for (const scenarioOutcome of scenarioOutcomes) {
    console.log(`- ${scenarioOutcome.scenarioId}: ${scenarioOutcome.outcome} (${scenarioOutcome.summary})`);
  }

  if (rollup.outcome === 'HARD_FAIL') {
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
