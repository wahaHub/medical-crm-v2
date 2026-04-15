import type { FaqAnswerInput, FaqPlanInput } from './faq-llm-adapter.js';

export const FAQ_PLAN_PROMPT_VERSION = 'faq-plan-v1';
export const FAQ_ANSWER_PROMPT_VERSION = 'faq-answer-v1';

export function buildFaqPlanPrompt(input: FaqPlanInput): string {
  return [
    `version=${FAQ_PLAN_PROMPT_VERSION}`,
    'role=FAQ planner',
    'instructions=Infer the most likely faq query and optional category from the compact task envelope.',
    input.taskPrompt,
    `latest_user_message=${input.latestUserMessage}`,
  ].join('\n');
}

export function buildFaqAnswerPrompt(input: FaqAnswerInput): string {
  return [
    `version=${FAQ_ANSWER_PROMPT_VERSION}`,
    'role=FAQ answer worker',
    'instructions=Answer using only the retrieved faq matches. Cite ids that support the answer.',
    input.taskPrompt,
    `latest_user_message=${input.latestUserMessage}`,
    `plan_query=${input.plan.query}`,
    `plan_category=${input.plan.category ?? 'none'}`,
    `match_ids=${input.matches.map((match) => match.id).join(',') || 'none'}`,
    `detail_ids=${input.details.map((detail) => detail.id).join(',') || 'none'}`,
  ].join('\n');
}
