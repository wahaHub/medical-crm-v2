import type { FaqAnswerInput, FaqPlanInput } from './faq-llm-adapter.js';
import type { FaqWorkerTask } from './worker-task.js';

export const FAQ_PLAN_PROMPT_VERSION = 'faq-plan-v1';
export const FAQ_ANSWER_PROMPT_VERSION = 'faq-answer-v1';

export function buildFaqPlanPrompt(input: FaqPlanInput): string {
  return [
    `version=${FAQ_PLAN_PROMPT_VERSION}`,
    'role=FAQ planner',
    'instructions=Infer the most likely faq query and optional category from the structured worker task.',
    `current_stage=${renderCurrentStage(input.task)}`,
    `primary_stage=${renderPrimaryStage(input.task)}`,
    `intent=${input.task.intent ?? 'unknown'}`,
    `supervisor_reason=${input.task.supervisorReason ?? 'none'}`,
    `response_mode=${input.task.responseMode ?? 'standard'}`,
    `safety_risk_type=${input.task.safetyRiskType ?? 'none'}`,
    `redirect_target=${input.task.redirectTarget ?? 'none'}`,
    `business_scope=${input.task.businessScope?.join(', ') ?? 'none'}`,
    `output_rules=${input.task.outputRules?.join(', ') ?? 'none'}`,
    `primary_action=${stringifyTaskField(input.task.primaryAction)}`,
    `follow_up_action=${stringifyTaskField(input.task.followUpAction)}`,
    `loaded_skill_sections=${formatLoadedSkillSections(input.task.loadedSkillSections)}`,
    `read_intents=${formatReadIntents(input.task.readIntents)}`,
    `response_contract=${stringifyTaskField(input.task.responseContract)}`,
    `latest_user_message=${input.task.latestUserMessage}`,
  ].join('\n');
}

export function buildFaqAnswerPrompt(input: FaqAnswerInput): string {
  return [
    `version=${FAQ_ANSWER_PROMPT_VERSION}`,
    'role=FAQ answer worker',
    'instructions=Answer using only the retrieved faq matches. Cite ids that support the answer.',
    `current_stage=${renderCurrentStage(input.task)}`,
    `primary_stage=${renderPrimaryStage(input.task)}`,
    `intent=${input.task.intent ?? 'unknown'}`,
    `supervisor_reason=${input.task.supervisorReason ?? 'none'}`,
    `response_mode=${input.task.responseMode ?? 'standard'}`,
    `safety_risk_type=${input.task.safetyRiskType ?? 'none'}`,
    `redirect_target=${input.task.redirectTarget ?? 'none'}`,
    `business_scope=${input.task.businessScope?.join(', ') ?? 'none'}`,
    `output_rules=${input.task.outputRules?.join(', ') ?? 'none'}`,
    `primary_action=${stringifyTaskField(input.task.primaryAction)}`,
    `follow_up_action=${stringifyTaskField(input.task.followUpAction)}`,
    `loaded_skill_sections=${formatLoadedSkillSections(input.task.loadedSkillSections)}`,
    `read_intents=${formatReadIntents(input.task.readIntents)}`,
    `response_contract=${stringifyTaskField(input.task.responseContract)}`,
    `latest_user_message=${input.task.latestUserMessage}`,
    `plan_query=${input.plan.query}`,
    `plan_category=${input.plan.category ?? 'none'}`,
    `match_ids=${input.matches.map((match) => match.id).join(',') || 'none'}`,
    `detail_ids=${input.details.map((detail) => detail.id).join(',') || 'none'}`,
  ].join('\n');
}

function stringifyTaskField(value: unknown): string {
  return value === undefined ? 'none' : JSON.stringify(value);
}

function renderCurrentStage(task: FaqWorkerTask): string {
  return task.currentStage ?? (task as { fromStage?: string }).fromStage ?? 'unknown';
}

function renderPrimaryStage(task: FaqWorkerTask): string {
  return task.primaryStage ?? (task as { toStage?: string }).toStage ?? 'unknown';
}

function formatLoadedSkillSections(
  sections: FaqWorkerTask['loadedSkillSections'],
): string {
  if (!sections || sections.length === 0) {
    return 'none';
  }

  return JSON.stringify(sections.map((section) => ({
    skillId: section.skillId,
    role: section.role,
    reasonCode: section.reasonCode,
    sectionIds: section.sectionIds,
    policyText: section.policyText,
    retrievalGuidance: section.retrievalGuidance,
    handlingGuidance: section.handlingGuidance,
    ...(section.readIntentTypes.length > 0 ? { readIntentTypes: section.readIntentTypes } : {}),
  })));
}

function formatReadIntents(readIntents: FaqWorkerTask['readIntents']): string {
  if (!readIntents || readIntents.length === 0) {
    return 'none';
  }

  return readIntents.map((intent) => {
    if (typeof intent === 'string') {
      return intent;
    }

    const stableIntent = {
      type: intent.type,
      ...('category' in intent ? { category: intent.category } : {}),
      reasonCode: intent.reasonCode,
    };
    return JSON.stringify(stableIntent);
  }).join(', ');
}
