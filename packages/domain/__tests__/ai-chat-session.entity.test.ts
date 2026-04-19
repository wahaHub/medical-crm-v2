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
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Three follow-up answers were collected.',
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

  it('derives records.minimal_triage.complete from a non-empty answers summary without needing a persisted answered status', () => {
    const session = new AiChatSession({
      id: 'session-triage-summary-1',
      sessionId: 'session-triage-summary-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Symptoms worsened for two weeks; MRI completed; no prior surgery.',
        minimalTriageComplete: false,
      },
      createdAt: new Date('2026-04-18T00:00:00.000Z'),
      updatedAt: new Date('2026-04-18T00:00:00.000Z'),
    });

    expect(session.statusSnapshot.minimalTriageStatus).toBe('pending');
    expect(session.statusSnapshot.minimalTriageAnswersSummary).toBe(
      'Symptoms worsened for two weeks; MRI completed; no prior surgery.',
    );
    expect(session.statusSnapshot.minimalTriageComplete).toBe(true);
    expect(deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot)).toMatchObject({
      'records.minimal_triage.complete': true,
    });
  });

  it('derives records.minimal_triage.complete from skipped triage even when the persisted boolean was false', () => {
    const session = new AiChatSession({
      id: 'session-triage-skipped-1',
      sessionId: 'session-triage-skipped-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      },
      createdAt: new Date('2026-04-18T00:00:00.000Z'),
      updatedAt: new Date('2026-04-18T00:00:00.000Z'),
    });

    expect(session.statusSnapshot.minimalTriageStatus).toBe('skipped');
    expect(session.statusSnapshot.minimalTriageAnswersSummary).toBeNull();
    expect(session.statusSnapshot.minimalTriageComplete).toBe(true);
    expect(deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot)).toMatchObject({
      'records.minimal_triage.complete': true,
    });
  });

  it('normalizes legacy answered triage rows into pending plus the stored summary', () => {
    const session = new AiChatSession({
      id: 'session-triage-legacy-summary-1',
      sessionId: 'session-triage-legacy-summary-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        minimalTriageStatus: 'answered' as never,
        minimalTriageAnswersSummary: 'Pain is intermittent; biopsy already confirmed diagnosis.',
        minimalTriageComplete: true,
      },
      createdAt: new Date('2026-04-18T00:00:00.000Z'),
      updatedAt: new Date('2026-04-18T00:00:00.000Z'),
    });

    expect(session.statusSnapshot.minimalTriageStatus).toBe('pending');
    expect(session.statusSnapshot.minimalTriageStatus).not.toBe('answered');
    expect(session.statusSnapshot.minimalTriageAnswersSummary).toBe(
      'Pain is intermittent; biopsy already confirmed diagnosis.',
    );
    expect(session.statusSnapshot.minimalTriageComplete).toBe(true);
  });

  it('can synthesize a reliable triage summary from a labeled conversation summary for legacy answered rows', () => {
    const session = new AiChatSession({
      id: 'session-triage-legacy-synthesized-1',
      sessionId: 'session-triage-legacy-synthesized-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        minimalTriageStatus: 'answered' as never,
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        conversationSummary:
          'Current stage: minimal triage. Minimal triage summary: Symptoms ongoing for 6 months; ultrasound already completed; no diabetes history. Recommendation not shown yet.',
      },
      createdAt: new Date('2026-04-18T00:00:00.000Z'),
      updatedAt: new Date('2026-04-18T00:00:00.000Z'),
    });

    expect(session.statusSnapshot.minimalTriageStatus).toBe('pending');
    expect(session.statusSnapshot.minimalTriageAnswersSummary).toBe(
      'Symptoms ongoing for 6 months; ultrasound already completed; no diabetes history.',
    );
    expect(session.statusSnapshot.minimalTriageComplete).toBe(true);
  });

  it('falls back legacy answered triage rows to pending and incomplete when no reliable summary exists', () => {
    const session = new AiChatSession({
      id: 'session-triage-legacy-empty-1',
      sessionId: 'session-triage-legacy-empty-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        minimalTriageStatus: 'answered' as never,
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        conversationSummary: 'The patient is interested in learning what the process looks like.',
      },
      createdAt: new Date('2026-04-18T00:00:00.000Z'),
      updatedAt: new Date('2026-04-18T00:00:00.000Z'),
    });

    expect(session.statusSnapshot.minimalTriageStatus).toBe('pending');
    expect(session.statusSnapshot.minimalTriageAnswersSummary).toBeNull();
    expect(session.statusSnapshot.minimalTriageComplete).toBe(false);
    expect(deriveCanonicalTruthFlagsFromStatusSnapshot(session.statusSnapshot)).toMatchObject({
      'records.minimal_triage.complete': false,
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
      minimalTriageStatus: 'pending',
      minimalTriageAnswersSummary: 'Three follow-up answers were already collected.',
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
      minimalTriageComplete: true,
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
