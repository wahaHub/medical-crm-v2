import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { bootstrapRealApiSession, type BootstrapOutcome, type BootstrapSuccessResult } from './chatbot-v3-real-api-dogfood/bootstrap.ts';
import { createDogfoodHttpClient } from './chatbot-v3-real-api-dogfood/http-client.ts';
import { parseDogfoodConfig } from './chatbot-v3-real-api-dogfood/config.ts';
import { getScenarioById, V1_REQUIRED_SCENARIO_IDS } from './chatbot-v3-real-api-dogfood/scenarios.ts';
import { runChatSession, type ChatRunnerResult } from './chatbot-v3-real-api-dogfood/chat-runner.ts';
import { evaluateScenarioOutcome, rollupRunOutcome, type DogfoodAxisEvaluation } from './chatbot-v3-real-api-dogfood/evaluator.ts';
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

function toTurnTranscript(scenarioId: string, turnIndex: number, result: ChatRunnerResult['turns'][number]): TurnTranscript {
  return {
    scenarioId,
    turnIndex,
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

function evaluateBlockedScenario(bootstrap: BootstrapOutcome): ScenarioOutcome {
  if (bootstrap.bootstrapMode === 'bootstrap_failed') {
    return {
      scenarioId: bootstrap.scenarioId,
      outcome: 'HARD_FAIL',
      summary: bootstrap.message,
      turns: [],
    };
  }

  if (bootstrap.bootstrapMode !== 'blocked_expected') {
    return {
      scenarioId: bootstrap.scenarioId,
      outcome: 'HARD_FAIL',
      summary: 'Blocked-path scenario unexpectedly established chat eligibility.',
      turns: [],
    };
  }

  return {
    scenarioId: bootstrap.scenarioId,
    outcome: 'PASS',
    summary: 'all four axes passed',
    turns: [],
  };
}

function evaluateAllowedScenario(
  scenarioId: string,
  bootstrap: BootstrapSuccessResult,
  chatResult: ChatRunnerResult | null,
): ScenarioOutcome {
  if (!chatResult) {
    return {
      scenarioId,
      outcome: 'HARD_FAIL',
      summary: 'Chat runner did not execute for an allowed-path scenario.',
      turns: [],
    };
  }

  const turnTranscripts = chatResult.turns.map((turn, index) => toTurnTranscript(scenarioId, index, turn));
  const hadHardFailure = turnTranscripts.some((turn) => turn.response.status >= 400 || turn.response.status === 0);
  const accessDecision = buildAxis(
    bootstrap.bootstrapMode === 'chat_allowed' ? 'PASS' : 'HARD_FAIL',
    'chat was not allowed after patient bootstrap',
  );
  const journey = buildAxis(hadHardFailure ? 'HARD_FAIL' : 'PASS', hadHardFailure ? 'chat turn failed before the expected journey completed' : undefined);
  const response = buildAxis(hadHardFailure ? 'HARD_FAIL' : 'PASS', hadHardFailure ? 'response status indicated a hard failure' : undefined);
  const continuity = buildAxis(chatResult.stoppedEarly ? 'HARD_FAIL' : 'PASS', chatResult.stoppedEarly ? 'conversation stopped early' : undefined);

  const evaluated = evaluateScenarioOutcome({
    scenarioId,
    accessDecision,
    journey,
    response,
    continuity,
  });

  return {
    scenarioId,
    outcome: evaluated.outcome,
    summary: evaluated.reason,
    turns: turnTranscripts,
  };
}

async function run() {
  const config = parseDogfoodConfig();
  const workspaceRoot = process.cwd();
  const client = createDogfoodHttpClient({
    baseUrl: config.baseUrl,
    site: config.site,
  });

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
            onboardingPayload: {
              email: 'dogfood@example.com',
              name: 'Dogfood Patient',
              preferredLanguage: 'en',
              destination: 'Shenzhen',
            },
          }
        : {}),
    });

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

    scenarioOutcomes.push(evaluateBlockedScenario(bootstrap));
  }

  const rollup: RunRollup = rollupRunOutcome(
    scenarioOutcomes.map((scenarioOutcome) => ({
      scenarioId: scenarioOutcome.scenarioId,
      outcome: scenarioOutcome.outcome,
      summary: scenarioOutcome.summary,
      turns: scenarioOutcome.turns,
    })),
  );

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

