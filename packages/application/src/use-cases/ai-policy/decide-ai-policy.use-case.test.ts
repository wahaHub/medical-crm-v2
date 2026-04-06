import { describe, expect, it, vi } from 'vitest';
import { DecideAiPolicyUseCase } from './decide-ai-policy.use-case.js';
import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import { RiskResolverService } from '../../services/policy-engine/risk-resolver.service.js';
import { ActionPlannerService } from '../../services/policy-engine/action-planner.service.js';
import { RecommendationPolicyService } from '../../services/policy-engine/recommendation-policy.service.js';

describe('DecideAiPolicyUseCase canonical semantics', () => {
  it('consumes valid canonical extraction output directly for primary semantics', async () => {
    const harness = createHarness({
      recommendationResult: {
        eligible: true,
        shortlist: [{ hospitalId: 'hospital-1', reasonCodes: ['fit'] }],
        reasonCodes: ['authoritative_shortlist_ready'],
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-1',
      userMessage: 'Please recommend a hospital for me.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
        possibleIntent: 'GENERAL_CONSULT',
        affirmative: true,
        negative: true,
      }),
      candidateHospitals: [{ hospitalId: 'hospital-1', reasonCodes: ['fit'] }],
    });

    expect(result.engagement_mode).toBe('DEEP_WORKFLOW');
    expect(result.next_action).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(result.shortlist).toEqual([
      {
        hospital_id: 'hospital-1',
        match_type: 'matched',
        reason_codes: ['fit'],
      },
    ]);
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
    }));
    expect(harness.recommendationPolicy.decide).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
    }));
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(2);
    expect(harness.contextBuilder.build.mock.calls[0]?.[0]?.depth).toBe('light');
    expect(harness.contextBuilder.build.mock.calls[1]?.[0]?.depth).toBe('full');
  });

  it('applies the deterministic fallback when canonical enum values are invalid', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      sessionId: 'session-2',
      userMessage: 'Please recommend a hospital for me.',
      extraction: {
        resolvedIntent: 'NOT_REAL',
        engagementSignal: 'INVALID',
        progressionSignal: 'ALMOST_READY',
        recommendationSignal: 'NOW',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
        possibleIntent: 'ASK_FOR_RECOMMENDATION',
      },
    });

    expect(result.engagement_mode).toBe('LIGHT_DISCOVERY');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('UNKNOWN');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
      resolvedIntent: 'UNKNOWN',
    }));
    expect(harness.recommendationPolicy.decide).not.toHaveBeenCalled();
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(1);
  });

  it('applies the deterministic fallback when canonical fields are missing', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      sessionId: 'session-3',
      userMessage: 'What documents do you need?',
      extraction: {
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'NONE',
        mentionsCondition: true,
      },
    });

    expect(result.engagement_mode).toBe('LIGHT_DISCOVERY');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('UNKNOWN');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
      resolvedIntent: 'UNKNOWN',
    }));
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(1);
  });

  it('does not let old weak fields alone drive semantic meaning in the main path', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      sessionId: 'session-4',
      userMessage: 'Please recommend a hospital for me.',
      extraction: {
        possibleIntent: 'ASK_FOR_RECOMMENDATION',
        possibleRisk: 'LOW',
        affirmative: true,
        negative: false,
      },
    });

    expect(result.engagement_mode).toBe('LIGHT_DISCOVERY');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('UNKNOWN');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
      resolvedIntent: 'UNKNOWN',
    }));
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(1);
  });

  it('no longer depends on legacy intent and engagement resolver output for primary semantics', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      sessionId: 'session-5',
      userMessage: 'hello',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'GENERAL_INFO',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'NONE',
        recommendationSignal: 'NONE',
      }),
    });

    expect(result.engagement_mode).toBe('QUALIFIED_EXPLORATION');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('GENERAL_CONSULT');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'QUALIFIED_EXPLORATION',
      progressionSignal: 'NONE',
      resolvedIntent: 'GENERAL_INFO',
    }));
  });

  it.each([
    {
      name: 'service-overview prompts',
      englishMessage: 'Can you give me a service overview?',
      chineseMessage: '可以介绍一下服务内容吗？',
      englishExtraction: buildCanonicalExtraction({
        resolvedIntent: 'GENERAL_INFO',
        engagementSignal: 'LIGHT_DISCOVERY',
      }),
      chineseExtraction: buildCanonicalExtraction({
        resolvedIntent: 'GENERAL_INFO',
        engagementSignal: 'LIGHT_DISCOVERY',
      }),
      harnessOptions: {},
      expectedNextAction: 'ANSWER_FAQ',
      expectedResolvedIntent: 'GENERAL_CONSULT',
    },
    {
      name: 'consult-process prompts',
      englishMessage: 'How does the online consult work?',
      chineseMessage: '线上问诊流程是怎样的？',
      englishExtraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_CONSULT_PROCESS',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
      }),
      chineseExtraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_CONSULT_PROCESS',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
      }),
      harnessOptions: {
        useRealActionPlanner: true,
        fullContextOverrides: {
          statusSnapshot: {
            consultationStatus: 'not_introduced',
          },
        },
      },
      expectedNextAction: 'INVITE_ONLINE_CONSULT',
      expectedResolvedIntent: 'ASK_CONSULT_PROCESS',
    },
    {
      name: 'doctor/hospital-direction prompts',
      englishMessage: 'Which doctor or hospital should I talk to?',
      chineseMessage: '我应该找哪位医生或哪家医院？',
      englishExtraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
        engagementSignal: 'DEEP_WORKFLOW',
        recommendationSignal: 'SEEKING_DIRECTION',
      }),
      chineseExtraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
        engagementSignal: 'DEEP_WORKFLOW',
        recommendationSignal: 'SEEKING_DIRECTION',
      }),
      harnessOptions: {
        recommendationResult: {
          eligible: true,
          shortlist: [{ hospitalId: 'hospital-2', reasonCodes: ['direction_fit'] }],
          reasonCodes: ['authoritative_shortlist_ready'],
        },
      },
      candidateHospitals: [{ hospitalId: 'hospital-2', reasonCodes: ['direction_fit'] }],
      expectedNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      expectedResolvedIntent: 'ASK_FOR_RECOMMENDATION',
      assertRecommendationPolicy: true,
    },
    {
      name: 'recommendation asks',
      englishMessage: 'Please recommend a hospital for me.',
      chineseMessage: '请推荐一家医院给我。',
      englishExtraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'DEEP_WORKFLOW',
        recommendationSignal: 'SEEKING_RECOMMENDATION',
      }),
      chineseExtraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'DEEP_WORKFLOW',
        recommendationSignal: 'SEEKING_RECOMMENDATION',
      }),
      harnessOptions: {
        recommendationResult: {
          eligible: true,
          shortlist: [{ hospitalId: 'hospital-1', reasonCodes: ['fit'] }],
          reasonCodes: ['authoritative_shortlist_ready'],
        },
        fullContextOverrides: {
          statusSnapshot: {
            docUploadStatus: 'uploaded',
            recommendationStatus: 'not_shown',
          },
        },
      },
      candidateHospitals: [{ hospitalId: 'hospital-1', reasonCodes: ['fit'] }],
      expectedNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      expectedResolvedIntent: 'ASK_FOR_RECOMMENDATION',
      assertRecommendationPolicy: true,
    },
  ])(
    'keeps English and Chinese $name on the same planner path when canonical semantics are already aligned',
    async ({
      chineseMessage,
      englishMessage,
      englishExtraction,
      chineseExtraction,
      harnessOptions,
      candidateHospitals,
      expectedNextAction,
      expectedResolvedIntent,
      assertRecommendationPolicy,
    }) => {
      expect(englishExtraction).toEqual(chineseExtraction);
      expect(englishExtraction).not.toBe(chineseExtraction);

      const englishHarness = createHarness(harnessOptions);
      const englishResult = await englishHarness.useCase.execute({
        sessionId: 'session-multilingual-regression',
        userMessage: englishMessage,
        extraction: englishExtraction,
        candidateHospitals,
      });

      const chineseHarness = createHarness(harnessOptions);
      const chineseResult = await chineseHarness.useCase.execute({
        sessionId: 'session-multilingual-regression',
        userMessage: chineseMessage,
        extraction: chineseExtraction,
        candidateHospitals,
      });

      expect(chineseResult).toEqual(englishResult);
      expect(englishResult.next_action).toBe(expectedNextAction);
      expect(chineseResult.next_action).toBe(expectedNextAction);
      expect(englishResult.resolved_intent).toBe(expectedResolvedIntent);

      const englishPlannerInput = englishHarness.actionPlanner.plan.mock.calls[0]?.[0];
      const chinesePlannerInput = chineseHarness.actionPlanner.plan.mock.calls[0]?.[0];

      expect(chinesePlannerInput).toEqual(englishPlannerInput);

      if (assertRecommendationPolicy) {
        const englishRecommendationInput = englishHarness.recommendationPolicy.decide.mock.calls[0]?.[0];
        const chineseRecommendationInput = chineseHarness.recommendationPolicy.decide.mock.calls[0]?.[0];

        expect(chineseRecommendationInput).toEqual(englishRecommendationInput);
      }
    },
  );

  it('passes canonical ACCEPT_DOC_UPLOAD through to the planner so uploaded docs can advance by workflow state', async () => {
    const harness = createHarness({
      useRealActionPlanner: true,
      fullContextOverrides: {
        statusSnapshot: {
          docUploadStatus: 'uploaded',
          recommendationStatus: 'not_shown',
          consultationStatus: 'not_introduced',
        },
      },
    });

    await harness.useCase.execute({
      sessionId: 'session-docs-complete-1',
      userMessage: 'Okay, I can send the records now.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ACCEPT_DOC_UPLOAD',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
      }),
    });

    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ACCEPT_DOC_UPLOAD',
    }));
  });

  it('passes canonical progression readiness to the planner for consult-process requests', async () => {
    const harness = createHarness({
      useRealActionPlanner: true,
      fullContextOverrides: {
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-consult-ready-1',
      userMessage: 'How does the online consult work? I am ready to proceed.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_CONSULT_PROCESS',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
      }),
    });

    expect(result.next_action).toBe('INVITE_ONLINE_CONSULT');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_CONSULT_PROCESS',
      progressionSignal: 'READY_TO_PROCEED',
    }));
  });

  it('keeps canonical hospital recommendation requests on an intent-first path even in light discovery', async () => {
    const harness = createHarness({
      useRealActionPlanner: true,
      fullContextOverrides: {
        statusSnapshot: {
          docUploadStatus: 'not_started',
          recommendationStatus: 'not_shown',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-light-recommendation-1',
      userMessage: 'Please recommend a hospital for me.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'LIGHT_DISCOVERY',
        recommendationSignal: 'SEEKING_RECOMMENDATION',
      }),
    });

    expect(result.next_action).toBe('REQUEST_DOC_UPLOAD');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
    }));
  });

  it('downgrades light-discovery canonical recommendation asks to exploration when shortlist gating has no shortlist', async () => {
    const harness = createHarness({
      useRealActionPlanner: true,
      fullContextOverrides: {
        statusSnapshot: {
          docUploadStatus: 'uploaded',
          recommendationStatus: 'not_shown',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-light-shortlist-miss-1',
      userMessage: 'Please recommend a hospital for me.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'LIGHT_DISCOVERY',
        recommendationSignal: 'SEEKING_RECOMMENDATION',
      }),
    });

    expect(harness.recommendationPolicy.decide).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
    }));
    expect(result.next_action).toBe('EXPLORE_HOSPITAL_RECOMMENDATIONS');
    expect(result.shortlist).toEqual([]);
  });

  it('passes canonical doctor-or-hospital direction into recommendation gating on the live path', async () => {
    const harness = createHarness({
      recommendationResult: {
        eligible: true,
        shortlist: [{ hospitalId: 'hospital-2', reasonCodes: ['direction_fit'] }],
        reasonCodes: ['authoritative_shortlist_ready'],
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-direction-1',
      userMessage: 'Which doctor or hospital should I talk to?',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
        engagementSignal: 'DEEP_WORKFLOW',
        recommendationSignal: 'SEEKING_DIRECTION',
      }),
      candidateHospitals: [{ hospitalId: 'hospital-2', reasonCodes: ['direction_fit'] }],
    });

    expect(result.next_action).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(harness.recommendationPolicy.decide).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
    }));
  });

  it('downgrades ACCEPT_DOC_UPLOAD with completed docs when shortlist gating has no shortlist', async () => {
    const harness = createHarness({
      useRealActionPlanner: true,
      fullContextOverrides: {
        statusSnapshot: {
          docUploadStatus: 'uploaded',
          recommendationStatus: 'not_shown',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-accept-docs-shortlist-miss-1',
      userMessage: 'Okay, I can send the records now.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ACCEPT_DOC_UPLOAD',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
      }),
    });

    expect(harness.recommendationPolicy.decide).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ACCEPT_DOC_UPLOAD',
    }));
    expect(result.next_action).toBe('EXPLORE_HOSPITAL_RECOMMENDATIONS');
    expect(result.shortlist).toEqual([]);
  });

  it('marks requested-human canonical routing as handoff-required when next action is HUMAN_HANDOFF', async () => {
    const harness = createHarness({
      useRealActionPlanner: true,
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-human-handoff-1',
      userMessage: 'I want to talk to a human.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
        engagementSignal: 'QUALIFIED_EXPLORATION',
      }),
    });

    expect(result.next_action).toBe('HUMAN_HANDOFF');
    expect(result.handoff_required).toBe(true);
  });

  it('persists selected_hospital_id when a recommendation offer is accepted in a persistent hospital context', async () => {
    const harness = createHarness({
      lightContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-accept-1',
          hospitalName: 'Medora Seoul',
          source: 'page_context',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      },
      fullContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-accept-1',
          hospitalName: 'Medora Seoul',
          source: 'page_context',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        statusSnapshot: {
          recommendationStatus: 'preliminary_shown',
          pendingOffer: { type: 'HOSPITAL_RECOMMENDATION', payload: {} },
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-accept-1',
      userMessage: 'let us proceed with this hospital',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'GENERAL_INFO',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'EXPLICITLY_COMMITTING',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
      }),
    });

    expect(result.resolved_intent).toBe('ACCEPT_HOSPITAL_RECOMMENDATION');
    expect(result.selected_hospital_id).toBe('hospital-accept-1');
  });

  it('does not persist selected_hospital_id when acceptance only has shortlist-derived hospital focus', async () => {
    const harness = createHarness({
      lightContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-shortlist-1',
          hospitalName: null,
          source: 'recent_shortlist',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      },
      fullContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-shortlist-1',
          hospitalName: null,
          source: 'recent_shortlist',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        statusSnapshot: {
          recommendationStatus: 'preliminary_shown',
          pendingOffer: { type: 'HOSPITAL_RECOMMENDATION', payload: {} },
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-accept-2',
      userMessage: 'okay, proceed with this one',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'SMALL_TALK_OR_GREETING',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
      }),
    });

    expect(result.resolved_intent).toBe('ACCEPT_HOSPITAL_RECOMMENDATION');
    expect(result.selected_hospital_id).toBeUndefined();
  });

  it('bridges recommendation asks to alternative-shortlist intent when a hospital is already selected', async () => {
    const harness = createHarness({
      recommendationResult: {
        eligible: true,
        shortlist: [{ hospitalId: 'hospital-alt-1', reasonCodes: ['fit'] }],
        reasonCodes: ['authoritative_shortlist_ready'],
      },
      fullContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-selected-2',
          hospitalName: 'Seoul Aesthetic Center',
          source: 'selected_hospital',
        },
        statusSnapshot: {
          selectedHospitalId: 'hospital-selected-2',
          recommendationStatus: 'preliminary_shown',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-selected-1',
      userMessage: 'Can you show me other hospital options?',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'DEEP_WORKFLOW',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
      }),
      candidateHospitals: [{ hospitalId: 'hospital-alt-1', reasonCodes: ['fit'] }],
    });

    expect(result.resolved_intent).toBe('ASK_ALTERNATIVE_HOSPITAL_RECOMMENDATIONS');
    expect(result.next_action).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(harness.recommendationPolicy.decide).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_ALTERNATIVE_HOSPITAL_RECOMMENDATIONS',
    }));
  });

  it('keeps missing-doc recommendation requests on the doc-upload path even when a hospital is already selected', async () => {
    const harness = createHarness({
      useRealActionPlanner: true,
      fullContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-selected-2',
          hospitalName: 'Seoul Aesthetic Center',
          source: 'selected_hospital',
        },
        statusSnapshot: {
          selectedHospitalId: 'hospital-selected-2',
          docUploadStatus: 'none',
          recommendationStatus: 'preliminary_shown',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-selected-2',
      userMessage: 'Can you show me other hospitals?',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'DEEP_WORKFLOW',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
      }),
      candidateHospitals: [{ hospitalId: 'hospital-alt-1', reasonCodes: ['fit'] }],
    });

    expect(result.resolved_intent).toBe('ASK_FOR_RECOMMENDATION');
    expect(result.next_action).toBe('REQUEST_DOC_UPLOAD');
    expect(harness.recommendationPolicy.decide).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
    }));
  });

  it('recovers ACCEPT_HOSPITAL_RECOMMENDATION for commitment-like acceptance context even when canonical intent is general info', async () => {
    const harness = createHarness({
      lightContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-accept-2',
          hospitalName: 'Medora Seoul',
          source: 'page_context',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      },
      fullContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-accept-2',
          hospitalName: 'Medora Seoul',
          source: 'page_context',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        statusSnapshot: {
          recommendationStatus: 'preliminary_shown',
          pendingOffer: { type: 'HOSPITAL_RECOMMENDATION', payload: {} },
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-accept-3',
      userMessage: 'okay, let us proceed with this one',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'GENERAL_INFO',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'EXPLICITLY_COMMITTING',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
      }),
    });

    expect(result.resolved_intent).toBe('ACCEPT_HOSPITAL_RECOMMENDATION');
    expect(result.selected_hospital_id).toBe('hospital-accept-2');
  });

  it('does not misclassify a next-steps follow-up as hospital acceptance under pending recommendation context', async () => {
    const harness = createHarness({
      lightContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-followup-1',
          hospitalName: 'Medora Seoul',
          source: 'page_context',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      },
      fullContextOverrides: {
        activeHospitalContext: {
          hospitalId: 'hospital-followup-1',
          hospitalName: 'Medora Seoul',
          source: 'page_context',
        },
        pendingOffer: { exists: true, type: 'HOSPITAL_RECOMMENDATION' },
        lastAssistantAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        statusSnapshot: {
          recommendationStatus: 'preliminary_shown',
          pendingOffer: { type: 'HOSPITAL_RECOMMENDATION', payload: {} },
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
        },
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-followup-1',
      userMessage: 'what are the next steps?',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'GENERAL_INFO',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'OPEN_TO_NEXT_STEP',
        recommendationSignal: 'NONE',
      }),
    });

    expect(result.resolved_intent).toBe('GENERAL_CONSULT');
    expect(result.selected_hospital_id).toBeUndefined();
    expect(result.next_action).toBe('ANSWER_FAQ');
  });
});

type HarnessOptions = {
  recommendationResult?: {
    eligible: boolean;
    shortlist: Array<{ hospitalId: string; reasonCodes: string[] }>;
    reasonCodes: string[];
  };
  useRealActionPlanner?: boolean;
  lightContextOverrides?: Record<string, unknown>;
  fullContextOverrides?: Record<string, unknown>;
};

function createHarness(options: HarnessOptions = {}) {
  const lightContext = buildLightContext(options.lightContextOverrides);
  const fullContext = buildFullContext(options.fullContextOverrides);

  const contextBuilder = {
    build: vi.fn(async (input: { depth?: string }) => (
      input.depth === 'full' ? fullContext : lightContext
    )),
  } as unknown as ContextBuilderService & {
    build: ReturnType<typeof vi.fn>;
  };

  const riskResolver = {
    resolve: vi.fn(async () => ({
      riskLevel: 'LOW',
      overrideAction: null,
      reasonCodes: ['risk_low'],
    })),
  } as unknown as RiskResolverService & {
    resolve: ReturnType<typeof vi.fn>;
  };

  const actionPlanner = {
    plan: options.useRealActionPlanner
      ? vi.fn((input) => new ActionPlannerService().plan(input))
      : vi.fn(() => ({
          nextAction: 'ANSWER_FAQ',
          secondaryAction: null,
          reasonCodes: ['planned'],
        })),
  } as unknown as ActionPlannerService & {
    plan: ReturnType<typeof vi.fn>;
  };

  const recommendationPolicy = {
    decide: vi.fn(async () => options.recommendationResult ?? {
      eligible: false,
      shortlist: [],
      reasonCodes: ['recommendation_deferred'],
    }),
  } as unknown as RecommendationPolicyService & {
    decide: ReturnType<typeof vi.fn>;
  };

  return {
    useCase: new DecideAiPolicyUseCase(
      contextBuilder,
      riskResolver,
      actionPlanner,
      recommendationPolicy,
    ),
    contextBuilder,
    riskResolver,
    actionPlanner,
    recommendationPolicy,
  };
}

function buildCanonicalExtraction(overrides: Record<string, unknown> = {}) {
  return {
    resolvedIntent: 'GENERAL_INFO',
    engagementSignal: 'LIGHT_DISCOVERY',
    progressionSignal: 'NONE',
    recommendationSignal: 'NONE',
    mentionsCondition: false,
    mentionsDoctorOrHospitalNeed: false,
    ...overrides,
  };
}

function buildLightContext(overrides: Record<string, unknown> = {}) {
  return {
    contextDepth: 'light',
    sessionId: 'session-1',
    userMessage: 'hello',
    sessionRef: { id: 'db-session-1', sessionId: 'session-1', patientId: null },
    patientId: null,
    currentEngagementMode: 'LIGHT_DISCOVERY',
    hospitalType: 'REGULAR',
    activeHospitalContext: null,
    pendingOffer: { exists: false, type: null },
    pendingQuestion: { exists: false, type: null },
    lastAssistantAction: null,
    safetyFlags: {
      riskLevel: 'LOW',
      hasHighRiskSignal: false,
      requiresSafetyHandling: false,
    },
    profile: null,
    recentMessages: [],
    recentTimeline: [],
    activeFollowups: [],
    recentHandoffs: [],
    ...overrides,
  };
}

function buildFullContext(overrides: Record<string, unknown> = {}) {
  const base = {
    contextDepth: 'full',
    sessionId: 'session-1',
    userMessage: 'hello',
    sessionRef: { id: 'db-session-1', sessionId: 'session-1', patientId: null },
    patientId: null,
    currentEngagementMode: 'DEEP_WORKFLOW',
    hospitalType: 'REGULAR',
    activeHospitalContext: null,
    pendingOffer: { exists: false, type: null },
    pendingQuestion: { exists: false, type: null },
    lastAssistantAction: 'CONSULT_CONVERSION',
    safetyFlags: {
      riskLevel: 'LOW',
      hasHighRiskSignal: false,
      requiresSafetyHandling: false,
    },
    statusSnapshot: {
      conditionStatus: 'known',
      formStatus: 'completed',
      docUploadStatus: 'uploaded',
      recommendationStatus: 'preliminary_shown',
      consultationStatus: 'ready',
      packageStatus: 'shown',
      handoffStatus: 'not_needed',
      leadMaturity: 'qualified',
      riskLevel: 'low',
      trustOrObjection: 'none',
      pendingOffer: null,
      pendingQuestion: null,
      lastNextAction: 'CONSULT_CONVERSION',
      lastResolvedIntent: 'GENERAL_CONSULT',
      conversationSummary: 'Existing qualified context.',
      lastPolicyDecisionAt: null,
      lastUserMessageAt: null,
      lastAssistantMessageAt: null,
    },
    profile: null,
    recentMessages: [],
    recentTimeline: [],
    activeFollowups: [],
    recentHandoffs: [],
  };

  if (!('statusSnapshot' in overrides)) {
    return {
      ...base,
      ...overrides,
    };
  }

  const overrideStatusSnapshot = overrides.statusSnapshot as Record<string, unknown>;
  return {
    ...base,
    ...overrides,
    statusSnapshot: {
      ...base.statusSnapshot,
      ...overrideStatusSnapshot,
    },
  };
}
