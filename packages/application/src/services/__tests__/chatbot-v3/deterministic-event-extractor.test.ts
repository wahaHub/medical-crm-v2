import { describe, expect, it } from 'vitest';
import { extractDeterministicEvent } from '../../chatbot-v3/deterministic-event-extractor.js';

describe('extractDeterministicEvent', () => {
  it('maps supported structured actions to deterministic events', () => {
    const cases = [
      'TRIAGE_SUBMITTED',
      'TRIAGE_SKIPPED',
      'RECOMMENDATION_SELECTED',
      'RECOMMENDATION_SKIPPED',
    ] as const;

    for (const actionType of cases) {
      const event = extractDeterministicEvent({
        message: 'structured frontend action',
        userAction: { type: actionType },
        attachments: [],
      });

      expect(event).toMatchObject({
        eventType: actionType,
        confidence: 1,
        source: 'deterministic',
      });
    }
  });

  it('copies selected hospital ids from recommendation selection actions', () => {
    const event = extractDeterministicEvent({
      message: 'I choose these hospitals',
      userAction: { type: 'RECOMMENDATION_SELECTED', selectedHospitalIds: ['h1', 'h2'] },
      attachments: [],
    });

    expect(event?.eventType).toBe('RECOMMENDATION_SELECTED');
    expect(event?.metadata?.selectedHospitalIds).toEqual(['h1', 'h2']);
  });

  it('maps attachments to DOCUMENTS_UPLOADED with document count metadata', () => {
    const event = extractDeterministicEvent({
      message: 'uploaded reports',
      attachments: [{ name: 'MRI.pdf' }, { name: 'pathology.pdf' }],
    });

    expect(event).toMatchObject({
      eventType: 'DOCUMENTS_UPLOADED',
      confidence: 1,
      source: 'deterministic',
      metadata: { documentCount: 2 },
    });
  });

  it('detects explicit human handoff requests before all other deterministic matches', () => {
    const event = extractDeterministicEvent({
      message: 'Please let me talk to a real person.',
      userAction: { type: 'TRIAGE_SUBMITTED' },
      attachments: [{ name: 'MRI.pdf' }],
    });

    expect(event?.eventType).toBe('USER_REQUESTED_HUMAN');
    expect(event?.source).toBe('deterministic');
  });

  it('lets attachment signals win over structured actions so uploads persist first', () => {
    const event = extractDeterministicEvent({
      message: 'submitted intake and uploaded a file',
      userAction: { type: 'TRIAGE_SUBMITTED' },
      attachments: [{ name: 'MRI.pdf' }],
    });

    expect(event).toMatchObject({
      eventType: 'DOCUMENTS_UPLOADED',
      metadata: { documentCount: 1 },
    });
  });

  it('lets recommendation-selection attachment turns persist documents before progression', () => {
    const event = extractDeterministicEvent({
      message: 'I choose hospital 1 and uploaded my MRI.',
      userAction: { type: 'RECOMMENDATION_SELECTED', selectedHospitalIds: ['h1'] },
      attachments: [{ name: 'MRI.pdf' }],
    });

    expect(event).toMatchObject({
      eventType: 'DOCUMENTS_UPLOADED',
      confidence: 1,
      source: 'deterministic',
      metadata: { documentCount: 1 },
    });
  });

  it('lets next-step attachment turns persist documents before progression', () => {
    const event = extractDeterministicEvent({
      message: 'What is the next step after this?',
      attachments: [{ name: 'MRI.pdf' }],
    });

    expect(event).toMatchObject({
      eventType: 'DOCUMENTS_UPLOADED',
      confidence: 1,
      source: 'deterministic',
      metadata: { documentCount: 1 },
    });
  });

  it('does not classify FAQ in the deterministic layer', () => {
    const event = extractDeterministicEvent({
      message: 'what are your prices?',
      attachments: [],
    });

    expect(event).toBeNull();
  });

  it('returns null when there are no deterministic signals', () => {
    const event = extractDeterministicEvent({
      message: 'I have had symptoms for six months.',
      attachments: [],
    });

    expect(event).toBeNull();
  });
});
