import type { AiChatMessage, AiChatStatusSnapshot } from '@medical-crm/domain';
import type { JourneySnapshot } from './types.js';

export function readJourneySnapshotFromStoredChatbotV2(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): JourneySnapshot | null {
  return parseJourneySnapshotRecord(
    asRecord(asRecord(statusSnapshot)?.['chatbot_v2'] ?? asRecord(statusSnapshot)?.['chatbotV2'])['journey_snapshot']
      ?? asRecord(asRecord(statusSnapshot)?.['chatbot_v2'] ?? asRecord(statusSnapshot)?.['chatbotV2'])['journeySnapshot']
      ?? asRecord(statusSnapshot)?.['journey_snapshot']
      ?? asRecord(statusSnapshot)?.['journeySnapshot'],
  );
}

export function readLatestJourneySnapshotFromMessages(
  messages: Array<Pick<AiChatMessage, 'role' | 'metadata'>>,
): JourneySnapshot | null {
  for (const message of messages) {
    if (message.role !== 'ASSISTANT') {
      continue;
    }

    const metadata = asRecord(message.metadata);
    const chatbotV2 = asRecord(metadata['chatbotV2'] ?? metadata['chatbot_v2']);
    const parsed = parseJourneySnapshotRecord(
      chatbotV2['journeySnapshot']
        ?? chatbotV2['journey_snapshot'],
    );

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function resolvePrimaryJourneySnapshot(input: {
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined;
  recentMessages?: Array<Pick<AiChatMessage, 'role' | 'metadata'>>;
  fallback?: JourneySnapshot;
}): JourneySnapshot {
  const fromMessages = input.recentMessages
    ? readLatestJourneySnapshotFromMessages(input.recentMessages)
    : null;
  if (fromMessages) {
    return fromMessages;
  }

  const fromStored = readJourneySnapshotFromStoredChatbotV2(input.statusSnapshot);
  if (fromStored) {
    return fromStored;
  }

  return input.fallback ?? {
    currentStage: 'EXPLAIN_PROCESS',
    currentPhase: 'active',
  };
}

function parseJourneySnapshotRecord(value: unknown): JourneySnapshot | null {
  const record = asRecord(value);
  const currentStage = asString(record['currentStage'] ?? record['current_stage']);
  const currentPhase = asString(record['currentPhase'] ?? record['current_phase']);

  if (!isJourneyStage(currentStage) || !isJourneyPhase(currentPhase)) {
    return null;
  }

  return {
    currentStage,
    currentPhase,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isJourneyStage(value: string | null): value is JourneySnapshot['currentStage'] {
  return value === 'EXPLAIN_PROCESS'
    || value === 'COLLECT_MEDICAL_INPUTS'
    || value === 'RECOMMENDATION'
    || value === 'ONLINE_CONSULT'
    || value === 'HUMAN_HANDOFF';
}

function isJourneyPhase(value: string | null): value is JourneySnapshot['currentPhase'] {
  return value === 'pre' || value === 'active' || value === 'post';
}
