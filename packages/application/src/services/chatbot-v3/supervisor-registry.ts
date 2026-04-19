export const SUPERVISOR_AGENT_REGISTRY = {
  FaqAgent: [
    'Agent: FaqAgent',
    'When to use: Use when the user is asking for factual information, process explanation, service clarification, or FAQ-style questions.',
    'Task style: Ask it to answer or explain the user\'s question using FAQ knowledge only.',
    'Send these facts: current stage, process explanation status, destination context, and hospital context if present.',
  ].join('\n'),
  RecommendationAgent: [
    'Agent: RecommendationAgent',
    'When to use: Use when the user wants hospital recommendations, wants recommendations refreshed, wants hospitals compared, or asks why a hospital is suitable.',
    'Task style: Ask it to generate, refresh, compare, or explain hospital recommendations.',
    'Send these facts: condition, destination, language, gender, minimal triage completion, recommendation progress, and any available records summary if relevant.',
  ].join('\n'),
  RecordsAgent: [
    'Agent: RecordsAgent',
    'When to use: Use when the system needs to complete minimal medical triage, guide diagnosis-proof upload, process an uploaded diagnosis certificate or supporting diagnosis document, or determine whether diagnosis-proof upload has materially progressed.',
    'Task style: Ask it to ask the 3 minimal triage questions when triage is incomplete, or guide the user to upload diagnosis proof / diagnosis certificate / supporting diagnosis documents once the journey reaches COLLECT_MEDICAL_INPUTS.',
    'Send these facts: intake facts, minimal triage completion, diagnosis-proof upload status, and any collection progress relevant to online consultation readiness.',
  ].join('\n'),
  ConsultAgent: [
    'Agent: ConsultAgent',
    'When to use: Use when the user is ready to move into online consultation or needs the deterministic consultation step advanced.',
    'Task style: Ask it to carry out the next consultation workflow step deterministically.',
    'Send these facts: selected recommendation status, process explanation status, consultation readiness, and any required session identifiers.',
  ].join('\n'),
  HandoffAgent: [
    'Agent: HandoffAgent',
    'When to use: Use when the session should escalate to a human advisor or a human handoff is already active.',
    'Task style: Ask it to create or continue the human handoff workflow deterministically.',
    'Send these facts: current stage, handoff status, escalation reason, and any required session identifiers.',
  ].join('\n'),
} as const;

export function renderSupervisorAgentRegistry(): string {
  return Object.values(SUPERVISOR_AGENT_REGISTRY).join('\n\n');
}

export const SUPERVISOR_REGISTRY = SUPERVISOR_AGENT_REGISTRY;

export function renderSupervisorRegistry(): string {
  return renderSupervisorAgentRegistry();
}

export function renderSupervisorRegistryEntry(
  agent: keyof typeof SUPERVISOR_AGENT_REGISTRY,
): string {
  return SUPERVISOR_AGENT_REGISTRY[agent];
}
