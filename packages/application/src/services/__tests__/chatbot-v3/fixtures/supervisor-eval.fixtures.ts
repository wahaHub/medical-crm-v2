import type {
  OrchestratorV3DecisionInput,
  SupervisorProposal,
} from '../../../chatbot-v3/types.js';

export interface SupervisorEvalFixture {
  id: string;
  bucket: string;
  mode: 'heuristic' | 'gateway';
  input: OrchestratorV3DecisionInput;
  gatewayOutput?: unknown;
  expected: SupervisorProposal;
}

function createInput(
  overrides: Partial<OrchestratorV3DecisionInput>,
): OrchestratorV3DecisionInput {
  return {
    currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    conversationSummary: 'The session just started and no recommendation has been shown yet.',
    latestUserMessage: 'Please recommend hospitals for me.',
    intake: {
      condition: 'lung cancer',
      targetDestination: 'Shanghai',
      language: 'en',
      gender: 'female',
    },
    current: {
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    },
    suggestion: {
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'minimal triage is complete',
    },
    facts: {
      'records.minimal_triage.complete': true,
    },
    availableReadDomains: ['records.status', 'recommendation.status'],
    ...overrides,
  };
}

const FAQ_GOAL = 'Answer the user\'s question using FAQ knowledge only.';
const RECOMMENDATION_GOAL = 'Generate hospital recommendations for this user.';

export const SUPERVISOR_EVAL_FIXTURES: SupervisorEvalFixture[] = [
  {
    id: 'ambiguous-short-confirmation-before-process',
    bucket: 'Ambiguous confirmation',
    mode: 'heuristic',
    input: createInput({
      currentStage: 'RECOMMENDATION',
      latestUserMessage: 'yes',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'user accepted the next step',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.selected': true,
        'process.explained': false,
      },
    }),
    expected: {
      intent: 'progression',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'recommendation selected and process explanation should follow',
      task: {
        goal: FAQ_GOAL,
        latestUserMessage: 'yes',
        necessaryFacts: {
          'current.stage': 'RECOMMENDATION',
          'intake.target_destination': 'Shanghai',
        },
      },
    },
  },
  {
    id: 'mixed-handoff-process-request-denied-to-explain',
    bucket: 'Mixed intent',
    mode: 'heuristic',
    input: createInput({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      latestUserMessage: 'Can you explain the process first before I talk to a human?',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      suggestion: {
        intent: 'handoff',
        suggestedStage: 'HUMAN_HANDOFF',
        reason: 'user asked for a human',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
      bootstrap: {
        message: 'Can you explain the process first before I talk to a human?',
        canCreateHandoff: false,
      },
    }),
    expected: {
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'direct human request cannot create handoff ticket for this session',
      task: {
        goal: FAQ_GOAL,
        latestUserMessage: 'Can you explain the process first before I talk to a human?',
        necessaryFacts: {
          'current.stage': 'COLLECT_MEDICAL_INPUTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    },
  },
  {
    id: 'repeat-recommendation-in-place',
    bucket: 'Recommendation repeat',
    mode: 'gateway',
    input: createInput({
      currentStage: 'RECOMMENDATION',
      latestUserMessage: 'Can you show me other hospitals again?',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'repeat recommendation in place',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.generated': true,
        'recommendation.selected': false,
      },
    }),
    gatewayOutput: {
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'repeat recommendation in place',
    },
    expected: {
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'repeat recommendation in place',
      task: {
        goal: RECOMMENDATION_GOAL,
        latestUserMessage: 'Can you show me other hospitals again?',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'intake.language': 'en',
          'intake.gender': 'female',
          'records.minimal_triage.complete': true,
          'recommendation.generated': true,
          'recommendation.selected': false,
        },
      },
    },
  },
  {
    id: 'revisit-recommendation-from-later-stage',
    bucket: 'Recommendation revisit',
    mode: 'gateway',
    input: createInput({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      latestUserMessage: 'Please go back to the recommendations.',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'post',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'revisit recommendation later in the journey',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.generated': true,
        'process.explained': true,
      },
    }),
    gatewayOutput: {
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'revisit recommendation later in the journey',
    },
    expected: {
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'revisit recommendation later in the journey',
      task: {
        goal: RECOMMENDATION_GOAL,
        latestUserMessage: 'Please go back to the recommendations.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'intake.language': 'en',
          'intake.gender': 'female',
          'records.minimal_triage.complete': true,
          'recommendation.generated': true,
        },
      },
    },
  },
  {
    id: 'late-process-explanation-request',
    bucket: 'Late explain request',
    mode: 'gateway',
    input: createInput({
      currentStage: 'ONLINE_CONSULT',
      latestUserMessage: 'Can you explain the process again before I schedule?',
      current: {
        stage: 'ONLINE_CONSULT',
        phase: 'active',
      },
      suggestion: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'user explicitly asked to explain the process again',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.selected': true,
        'process.explained': true,
      },
    }),
    gatewayOutput: {
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'user explicitly asked to explain the process again',
    },
    expected: {
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'user explicitly asked to explain the process again',
      task: {
        goal: FAQ_GOAL,
        latestUserMessage: 'Can you explain the process again before I schedule?',
        necessaryFacts: {
          'current.stage': 'ONLINE_CONSULT',
          'intake.target_destination': 'Shanghai',
        },
      },
    },
  },
];
