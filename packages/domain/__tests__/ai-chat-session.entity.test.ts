import { describe, expect, it } from 'vitest';
import {
  AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP,
  AiChatSession,
  deriveCanonicalTruthFlagsFromStatusSnapshot,
  deriveCanonicalTruthTruePatchFromStatusSnapshot,
} from '../src/index.js';

describe('AiChatSession canonical truth flags', () => {
  it('maps every canonical truth flag to an explicit persisted snapshot field', () => {
    expect(AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP).toEqual({
      'records.minimal_triage.complete': 'minimalTriageComplete',
      'process.explained': 'processExplained',
      'recommendation.generated': 'recommendationGenerated',
      'recommendation.selected': 'recommendationSelected',
      'consult.completed': 'consultCompleted',
      'handoff.active': 'handoffActive',
    });

    const session = new AiChatSession({
      id: 'session-1',
      sessionId: 'session-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelected: false,
        consultCompleted: true,
        handoffActive: false,
      },
      createdAt: new Date('2026-04-16T00:00:00.000Z'),
      updatedAt: new Date('2026-04-16T00:00:00.000Z'),
    });

    expect(deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot)).toEqual({
      'records.minimal_triage.complete': true,
      'process.explained': true,
      'recommendation.generated': true,
      'recommendation.selected': false,
      'consult.completed': true,
      'handoff.active': false,
    });
  });

  it('does not derive records.minimal_triage.complete from legacy upload or form statuses when explicit fields are absent', () => {
    expect(deriveCanonicalTruthFlagsFromStatusSnapshot({
      formStatus: 'completed',
      docUploadStatus: 'submitted',
      recommendationStatus: 'accepted',
      consultationStatus: 'completed',
      handoffStatus: 'requested',
      processExplained: false,
    })).toEqual({
      'records.minimal_triage.complete': false,
      'process.explained': false,
      'recommendation.generated': true,
      'recommendation.selected': true,
      'consult.completed': true,
      'handoff.active': true,
    });
  });

  it('keeps records.minimal_triage.complete false when migrated canonical fields are null and only legacy upload/form evidence exists', () => {
    const session = new AiChatSession({
      id: 'session-migrated-1',
      sessionId: 'session-migrated-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        formStatus: 'completed',
        docUploadStatus: 'submitted',
        recommendationStatus: 'accepted',
        consultationStatus: 'completed',
        handoffStatus: 'requested',
        processExplained: false,
        minimalTriageComplete: null as unknown as boolean,
        recommendationGenerated: null as unknown as boolean,
        recommendationSelected: null as unknown as boolean,
        consultCompleted: null as unknown as boolean,
        handoffActive: null as unknown as boolean,
      },
      createdAt: new Date('2026-04-16T00:00:00.000Z'),
      updatedAt: new Date('2026-04-16T00:00:00.000Z'),
    });

    expect(deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot)).toEqual({
      'records.minimal_triage.complete': false,
      'process.explained': false,
      'recommendation.generated': true,
      'recommendation.selected': true,
      'consult.completed': true,
      'handoff.active': true,
    });
  });

  it('still repairs other canonical truth from legacy evidence without treating minimal triage as complete', () => {
    const session = new AiChatSession({
      id: 'session-migrated-false-1',
      sessionId: 'session-migrated-false-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        formStatus: 'completed',
        docUploadStatus: 'submitted',
        recommendationStatus: 'accepted',
        consultationStatus: 'completed',
        handoffStatus: 'requested',
        processExplained: false,
        minimalTriageComplete: false,
        recommendationGenerated: false,
        recommendationSelected: false,
        consultCompleted: false,
        handoffActive: false,
      },
      createdAt: new Date('2026-04-16T00:00:00.000Z'),
      updatedAt: new Date('2026-04-16T00:00:00.000Z'),
    });

    expect(deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot)).toEqual({
      'records.minimal_triage.complete': false,
      'process.explained': false,
      'recommendation.generated': true,
      'recommendation.selected': true,
      'consult.completed': true,
      'handoff.active': true,
    });
  });

  it('repairs stale migrated false values with a true-only canonical patch without setting minimal triage from legacy uploads', () => {
    expect(deriveCanonicalTruthTruePatchFromStatusSnapshot({
      formStatus: 'completed',
      docUploadStatus: 'submitted',
      recommendationStatus: 'accepted',
      consultationStatus: 'completed',
      handoffStatus: 'requested',
      processExplained: false,
      minimalTriageComplete: false,
      recommendationGenerated: false,
      recommendationSelected: false,
      consultCompleted: false,
      handoffActive: false,
    })).toEqual({
      recommendationGenerated: true,
      recommendationSelected: true,
      consultCompleted: true,
      handoffActive: true,
    });
  });

  it('treats handoff.active as reversible lifecycle truth instead of a monotonic latch', () => {
    expect(deriveCanonicalTruthFlagsFromStatusSnapshot({
      handoffStatus: 'cancelled',
      handoffActive: true,
    })).toEqual({
      'records.minimal_triage.complete': false,
      'process.explained': false,
      'recommendation.generated': false,
      'recommendation.selected': false,
      'consult.completed': false,
      'handoff.active': false,
    });

    expect(deriveCanonicalTruthTruePatchFromStatusSnapshot({
      handoffStatus: 'cancelled',
      handoffActive: true,
    })).toEqual({});
  });
});
