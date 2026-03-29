import { describe, expect, it } from 'vitest';
import { EngagementModeResolverService } from '../../policy-engine/engagement-mode-resolver.service.js';

describe('EngagementModeResolverService', () => {
  it('resolves greeting-only input to LIGHT_DISCOVERY and does not treat lead maturity as a runtime shortcut', () => {
    const resolver = new EngagementModeResolverService();

    const result = resolver.resolve({
      userMessage: 'Hi',
      statusSnapshot: {
        leadMaturity: 'closing',
        riskLevel: 'LOW',
        pendingOffer: null,
        pendingQuestion: null,
      },
      recentMessages: [],
      profile: null,
      candidateSignals: {},
    });

    expect(result.engagementMode).toBe('LIGHT_DISCOVERY');
    expect(result.reasonCodes).toContain('low_signal_greeting');
  });

  it('resolves a cautious trust-building question to QUALIFIED_EXPLORATION', () => {
    const resolver = new EngagementModeResolverService();

    const result = resolver.resolve({
      userMessage: 'Can you explain how you work before I share details?',
      statusSnapshot: {
        leadMaturity: 'browsing',
        riskLevel: 'LOW',
        pendingOffer: null,
        pendingQuestion: null,
      },
      recentMessages: [],
      profile: null,
      candidateSignals: {},
    });

    expect(result.engagementMode).toBe('QUALIFIED_EXPLORATION');
    expect(result.reasonCodes).toContain('trust_building_signal');
  });

  it.each([
    ['start now', 'I want to start now and create a case.', 'CREATE_CASE'],
    ['upload now', 'I can upload my reports now.', 'REQUEST_DOCS'],
    ['connect me to a person', 'Please connect me to a person.', 'DEEP_WORKFLOW'],
  ])('resolves explicit %s requests to DEEP_WORKFLOW', (_, userMessage, possibleIntent) => {
    const resolver = new EngagementModeResolverService();

    const result = resolver.resolve({
      userMessage,
      statusSnapshot: {
        leadMaturity: 'browsing',
        riskLevel: 'LOW',
        pendingOffer: null,
        pendingQuestion: null,
      },
      recentMessages: [],
      profile: null,
      candidateSignals: {
        possibleIntent,
      },
    });

    expect(result.engagementMode).toBe('DEEP_WORKFLOW');
    expect(result.reasonCodes).toContain('explicit_progression_request');
  });

  it('does not treat a soft consult-conversion hint as automatic deep workflow', () => {
    const resolver = new EngagementModeResolverService();

    const result = resolver.resolve({
      userMessage: 'Can you explain the consultation options before I decide?',
      statusSnapshot: {
        leadMaturity: 'browsing',
        riskLevel: 'LOW',
        pendingOffer: null,
        pendingQuestion: null,
      },
      recentMessages: [],
      profile: null,
      candidateSignals: {
        possibleIntent: 'CONSULT_CONVERSION',
      },
    });

    expect(result.engagementMode).toBe('QUALIFIED_EXPLORATION');
    expect(result.reasonCodes).toContain('trust_building_signal');
    expect(result.engagementMode).not.toBe('DEEP_WORKFLOW');
  });

  it('uses the pending conversation context to escalate affirmative replies', () => {
    const resolver = new EngagementModeResolverService();

    const result = resolver.resolve({
      userMessage: 'Yes, please.',
      statusSnapshot: {
        leadMaturity: 'browsing',
        riskLevel: 'LOW',
        pendingOffer: {
          type: 'HOSPITAL_RECOMMENDATION',
          payload: { shortlistId: 'rec-1' },
        },
        pendingQuestion: null,
      },
      recentMessages: [
        {
          role: 'ASSISTANT',
          content: 'I can show you a shortlist if you want.',
          nextAction: 'CONSULT_CONVERSION',
        },
      ],
      profile: null,
      candidateSignals: {},
    });

    expect(result.engagementMode).toBe('DEEP_WORKFLOW');
    expect(result.reasonCodes).toContain('pending_context_confirmed');
  });

  it('bypasses cheap discovery handling for crisis signals even without commercial intent', () => {
    const resolver = new EngagementModeResolverService();

    const result = resolver.resolve({
      userMessage: 'I want to hurt myself.',
      statusSnapshot: {
        leadMaturity: 'browsing',
        riskLevel: 'LOW',
        pendingOffer: null,
        pendingQuestion: null,
      },
      recentMessages: [],
      profile: null,
      candidateSignals: {
        possibleRisk: 'CRISIS',
      },
    });

    expect(result.engagementMode).toBe('DEEP_WORKFLOW');
    expect(result.reasonCodes).toContain('risk_override');
  });

  it('keeps default profile values in LIGHT_DISCOVERY unless the message is stronger', () => {
    const resolver = new EngagementModeResolverService();

    const result = resolver.resolve({
      userMessage: 'What is this?',
      statusSnapshot: {
        leadMaturity: 'browsing',
        riskLevel: 'LOW',
        pendingOffer: null,
        pendingQuestion: null,
      },
      recentMessages: [],
      profile: {
        conditionOrGoal: null,
        conditionCategory: null,
        preferredDestination: [],
        preferredLanguage: null,
        budgetBand: null,
        urgencyLevel: null,
        existingReportsStatus: 'none',
        objectionTags: [],
        leadStage: 'browsing',
        nextBestAction: null,
        memorySummary: '',
      },
      candidateSignals: {},
    });

    expect(result.engagementMode).toBe('LIGHT_DISCOVERY');
    expect(result.reasonCodes).toContain('default_light_path');
  });
});
