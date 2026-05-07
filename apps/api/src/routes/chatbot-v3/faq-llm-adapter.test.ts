import { describe, expect, it, vi } from 'vitest';
import { FaqAgent } from './agents.js';
import { FaqLlmAdapter } from './faq-llm-adapter.js';
import { buildFaqAnswerPrompt, buildFaqPlanPrompt } from './faq-prompts.js';
import { createToolGateway } from './tool-gateway.js';
import { resolveFaqTaskPolicy, type FaqWorkerTask } from './worker-task.js';
import {
  FAQ_ANSWER_EVAL_FIXTURES,
} from './__fixtures__/degraded-path.fixtures.js';

function createFaqTask(latestUserMessage: string): FaqWorkerTask {
  return {
    agent: 'FaqAgent',
    currentStage: 'EXPLAIN_PROCESS',
    primaryStage: 'EXPLAIN_PROCESS',
    latestUserMessage,
    intent: 'faq',
    supervisorReason: 'user is asking an faq question',
    conversationSummary: 'Earlier: user selected hospital-1 and asked about consult timing.',
    recentMessages: [
      {
        id: 'm-1',
        role: 'USER',
        content: 'I selected Shanghai Chest Hospital.',
        createdAt: '2026-04-29T07:00:00.000Z',
      },
      {
        id: 'm-2',
        role: 'ASSISTANT',
        content: 'I can explain the next consult step.',
        createdAt: '2026-04-29T07:01:00.000Z',
      },
    ],
  };
}

describe('FaqLlmAdapter', () => {
  it('keeps the FAQ degraded-path fixture set complete', () => {
    expect(FAQ_ANSWER_EVAL_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'faq-degraded-fallback-no-grounding',
      'faq-low-confidence-grounded-answer',
    ]);
  });

  it('falls back to a deterministic plan when the plan output is invalid', async () => {
    const adapter = new FaqLlmAdapter({
      plan: {
        promptVersion: 'faq-plan-test',
        run: vi.fn(async () => ({
          category: 123,
          query: '',
          reason: null,
        })),
      },
    });

    await expect(adapter.plan({
      task: createFaqTask('How long does online consultation take to arrange?'),
    })).resolves.toEqual({
      query: 'How long does online consultation take to arrange?',
      reason: expect.stringContaining('fallback'),
    });
    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: 'faq-plan-test',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('marks citation fallback as schema validation failure in answer metadata', async () => {
    const adapter = new FaqLlmAdapter({
      answer: {
        promptVersion: 'faq-answer-test',
        model: 'gpt-4o-mini',
        run: vi.fn(async () => ({
          answer: 'Grounded answer',
          citedFaqIds: 'faq-1',
          confidence: 'high',
        })),
      },
    });

    await expect(adapter.answer({
      task: createFaqTask('How long does online consultation take to arrange?'),
      plan: {
        query: 'online consultation timing',
        reason: 'timing faq',
      },
      matches: [{
        id: 'faq-1',
        question: 'How long does online consultation take?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Consultation',
      }],
      details: [],
    })).resolves.toEqual({
      answer: 'Grounded answer',
      citedFaqIds: [],
      confidence: 'high',
    });
    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: 'faq-answer-test',
      nodeModel: 'gpt-4o-mini',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it.each(FAQ_ANSWER_EVAL_FIXTURES)('$id', async (fixture) => {
    const adapter = new FaqLlmAdapter({
      answer: {
        promptVersion: `faq-answer-fixture:${fixture.id}`,
        run: vi.fn(async () => fixture.rawAnswer),
      },
    });

    await expect(adapter.answer({
      task: createFaqTask(fixture.latestUserMessage),
      plan: {
        query: fixture.latestUserMessage,
        reason: fixture.bucket,
      },
      matches: fixture.matches,
      details: fixture.details,
    })).resolves.toEqual(fixture.expected);

    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: `faq-answer-fixture:${fixture.id}`,
      fallbackUsed: fixture.expectedMetadata.fallbackUsed,
      schemaValidationFailed: fixture.expectedMetadata.schemaValidationFailed,
    });
  });

  it('passes safety redirect task rules through FAQ prompts', () => {
    const task: FaqWorkerTask = {
      ...createFaqTask('能不能保证治好？'),
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'medical_facts', reasonCode: 'medical_safety' },
      }),
    };

    expect(buildFaqPlanPrompt({ task })).toContain('response_mode=safe_medical_redirect');
    expect(buildFaqAnswerPrompt({
      task,
      plan: { query: 'guarantee outcome', reason: 'safety redirect' },
      matches: [],
      details: [],
    })).toContain('output_rules=do_not_diagnose, do_not_recommend_medication, do_not_guarantee_outcome, mention_emergency_care_when_urgent, ask_one_safe_next_step');
  });

  it('falls back with business-boundary redirect copy for out-of-scope tasks without FAQ matches', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('你们能不能帮我办美国绿卡？'),
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'unknown', reasonCode: 'out_of_scope' },
      }),
    };

    await expect(adapter.answer({
      task,
      plan: { query: 'US green card', reason: 'out of scope redirect' },
      matches: [],
      details: [],
    })).resolves.toEqual({
      answer: expect.stringContaining('Medora'),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    });
    expect(task.outputRules).toEqual(expect.arrayContaining([
      'do_not_claim_we_can_help_with_unsupported_service',
      'preserve_primary_stage',
    ]));
  });

  it('keeps redirect policy ahead of FAQ match fallback copy', async () => {
    const adapter = new FaqLlmAdapter({
      answer: {
        promptVersion: 'faq-answer-invalid',
        run: vi.fn(async () => ({
          answer: 123,
          citedFaqIds: [],
          confidence: 'high',
        })),
      },
    });
    const task: FaqWorkerTask = {
      ...createFaqTask('能不能保证治好？'),
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'medical_facts', reasonCode: 'medical_safety' },
      }),
    };

    await expect(adapter.answer({
      task,
      plan: { query: 'guarantee outcome', reason: 'safety redirect' },
      matches: [{
        id: 'faq-normal-1',
        question: 'Can you explain the service process?',
        answer: 'First we collect records, then recommend hospitals.',
        category: 'process',
      }],
      details: [],
    })).resolves.toEqual({
      answer: expect.stringContaining('I cannot confirm a diagnosis in chat'),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    });
    const answer = (await adapter.answer({
      task,
      plan: { query: 'guarantee outcome', reason: 'safety redirect' },
      matches: [],
      details: [],
    })).answer;
    expect(answer).not.toContain('I cannot diagnose, choose treatment, recommend medication, or guarantee an outcome here.');
  });

  it('uses bruising-specific safety guidance for leukemia fear instead of abdominal bleeding copy', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('Wait if it is blood cancer should I go emergency or appointment?'),
      recentMessages: [
        {
          id: 'm-1',
          role: 'USER',
          content: 'I keep getting bruises, maybe leukemia? I saw xhs post and now very scared.',
          createdAt: '2026-05-02T00:00:00.000Z',
        },
        {
          id: 'm-2',
          role: 'USER',
          content: 'It is not many, like 3 on leg and one arm, but I do not remember hitting anything.',
          createdAt: '2026-05-02T00:01:00.000Z',
        },
      ],
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'medical_advice', reasonCode: 'medical_safety' },
      }),
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'blood cancer emergency appointment', reason: 'safety redirect' },
      matches: [],
      details: [],
    });

    expect(result).toEqual({
      answer: expect.stringContaining('For a few stable bruises without heavy or unstoppable bleeding'),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    });
    expect(result.answer).toContain('CBC');
    expect(result.answer).not.toContain('black or bloody stool');
    expect(result.answer).not.toContain('abdominal pain');
  });

  it('explains gum bleeding as serious only when bleeding is heavy or hard to stop', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('I do not understand what counts as serious bleeding, my gum bleeds when brushing but dentist said gum problem.'),
      recentMessages: [
        {
          id: 'm-1',
          role: 'USER',
          content: 'I keep getting bruises, maybe leukemia?',
          createdAt: '2026-05-02T00:00:00.000Z',
        },
      ],
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'medical_advice', reasonCode: 'medical_safety' },
      }),
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'serious bleeding gum brushing', reason: 'safety redirect' },
      matches: [],
      details: [],
    });

    expect(result.answer).toContain('Gum bleeding only when brushing');
    expect(result.answer).toContain('bleeding does not stop');
    expect(result.answer).not.toContain('black or bloody stool');
  });

  it('uses prior neurologic red-flag context when the latest message is only a timing follow-up', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('Can I wait and book next Friday?'),
      recentMessages: [
        {
          id: 'm-1',
          role: 'USER',
          content: 'One side of my face feels numb since last night.',
          createdAt: '2026-05-02T00:00:00.000Z',
        },
      ],
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'medical_advice', reasonCode: 'medical_safety' },
      }),
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'wait book next Friday facial numbness', reason: 'safety redirect' },
      matches: [],
      details: [],
    });

    expect(result.answer).toContain('One-sided facial numbness');
    expect(result.answer).toContain('seek local emergency care now');
    expect(result.answer).not.toContain('I cannot confirm a diagnosis in chat');
  });

  it.each([
    'I had a blood test already, what should I do next?',
    'I have a fever, should I book with you?',
  ])('does not use abdominal bleeding safety copy for broad symptom wording: %s', async (message) => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask(message),
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'medical_advice', reasonCode: 'medical_safety' },
      }),
    };

    const result = await adapter.answer({
      task,
      plan: { query: message, reason: 'safety redirect' },
      matches: [],
      details: [],
    });

    expect(result.answer).toContain('I cannot confirm a diagnosis in chat');
    expect(result.answer).not.toContain('black or bloody stool');
    expect(result.answer).not.toContain('abdominal pain');
  });

  it('uses skill-grounded fallback copy when the standalone FAQ index has no pricing hit', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('How much to see a pain specialist? I need budget.'),
      primaryAction: { type: 'ANSWER', target: 'pricing', mode: 'faq' },
      loadedSkillSections: [{
        skillId: 'pricing_skill',
        role: 'primary',
        reasonCode: 'user_asked_question_answer',
        sectionIds: ['pricing_online_consultation_fee'],
        readIntentTypes: ['PRICING_FACTORS'],
        policyText: ['Online consultation costs USD 400.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
    };

    await expect(adapter.answer({
      task,
      plan: { query: 'pain specialist pricing', reason: 'pricing question' },
      matches: [],
      details: [],
    })).resolves.toEqual({
      answer: expect.stringContaining('USD 400'),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    });
  });

  it('allows policy-grounded skill answers from the LLM instead of discarding them as FAQ failures', async () => {
    const run = vi.fn(async () => ({
      answer: 'You can start with only the most important diagnosis or CT summary; you do not need to upload everything at once.',
      citedFaqIds: [],
      confidence: 'high',
      policyGrounded: true,
    }));
    const adapter = new FaqLlmAdapter({
      answer: {
        promptVersion: 'faq-answer-should-not-run',
        run,
      },
    });
    const task: FaqWorkerTask = {
      ...createFaqTask('I have a CT report but I do not want upload here, is it safe?'),
      primaryAction: { type: 'ANSWER', target: 'policy', mode: 'faq' },
      loadedSkillSections: [{
        skillId: 'policy_skill',
        role: 'primary',
        reasonCode: 'privacy_hesitation',
        sectionIds: ['privacy_records_low_friction_path'],
        readIntentTypes: ['SERVICE_PREREQUISITES'],
        policyText: ['If the user hesitates to share records or information, ask only for the most important info or records or diagnosis only.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'medical records privacy', reason: 'privacy hesitation' },
      matches: [],
      details: [],
    });

    expect(run).toHaveBeenCalledOnce();
    expect(result.answer).toContain('do not need to upload everything at once');
    expect(result.policyGrounded).toBe(true);
    expect(result.answer).not.toContain('The usual Medora path');
    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });

  it('does not borrow policy grounding from fallback for an ungrounded LLM answer', async () => {
    const adapter = new FaqLlmAdapter({
      answer: {
        promptVersion: 'faq-answer-ungrounded-skill-answer',
        run: vi.fn(async () => ({
          answer: 'Yes, any payment method should work.',
          citedFaqIds: [],
          confidence: 'high',
        })),
      },
    });
    const task: FaqWorkerTask = {
      ...createFaqTask('Can I pay with any method?'),
      primaryAction: { type: 'ANSWER', target: 'payment', mode: 'faq' },
      loadedSkillSections: [{
        skillId: 'payment_skill',
        role: 'primary',
        reasonCode: 'payment_channel_question',
        sectionIds: ['payment_channels'],
        readIntentTypes: ['PAYMENT_POLICY'],
        policyText: ['Payment channel details depend on hospital and Medora service arrangement.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'any payment method', reason: 'payment channel' },
      matches: [],
      details: [],
    });

    expect(result).toEqual({
      answer: 'Yes, any payment method should work.',
      citedFaqIds: [],
      confidence: 'high',
    });
    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
  });

  it('answers insurance direct-billing questions with an insurance boundary instead of the generic consult path', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('I have insurance but not sure direct billing, my card says Cigna but employer changed vendor?'),
      primaryAction: { type: 'ANSWER', target: 'payment', mode: 'faq' },
      loadedSkillSections: [{
        skillId: 'payment_skill',
        role: 'primary',
        reasonCode: 'insurance_payment_question',
        sectionIds: ['insurance_boundary'],
        readIntentTypes: ['PAYMENT_POLICY'],
        policyText: ['Insurance questions should be explained by a human; Medora does not provide claims support.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'insurance direct billing Cigna employer vendor', reason: 'insurance boundary' },
      matches: [],
      details: [],
    });

    expect(result.answer).toContain('direct billing');
    expect(result.answer).toContain('insurer');
    expect(result.answer).toContain('human');
    expect(result.answer).not.toContain('The usual Medora path');
  });

  it('answers payment-channel questions without turning them into insurance copy', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('Can I pay with international card or Alipay?'),
      primaryAction: { type: 'ANSWER', target: 'payment', mode: 'faq' },
      loadedSkillSections: [{
        skillId: 'payment_skill',
        role: 'primary',
        reasonCode: 'payment_channel_question',
        sectionIds: ['payment_channels'],
        readIntentTypes: ['PAYMENT_POLICY'],
        policyText: ['Payment channel details depend on hospital and Medora service arrangement.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'international card Alipay', reason: 'payment channel' },
      matches: [],
      details: [],
    });

    expect(result.answer).toContain('payment channel');
    expect(result.answer).toContain('hospital');
    expect(result.answer).not.toContain('For insurer coverage');
  });

  it('answers airport taxi logistics directly while keeping medical booking order clear', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('I am flying from Shenzhen to Shanghai that morning, is taxi from airport long?'),
      primaryAction: { type: 'ANSWER', target: 'travel', mode: 'faq' },
      loadedSkillSections: [{
        skillId: 'travel_skill',
        role: 'primary',
        reasonCode: 'airport_transport_question',
        sectionIds: ['airport_pickup_transport'],
        readIntentTypes: ['TRAVEL_SUPPORT'],
        policyText: ['Medora can coordinate airport pickup and local transport after hospital and appointment direction are clearer.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'Shanghai airport taxi time', reason: 'airport transport' },
      matches: [],
      details: [],
    });

    expect(result.answer).toContain('airport');
    expect(result.answer).toContain('traffic');
    expect(result.answer).toContain('pickup');
    expect(result.answer).not.toContain('The medical path should come first');
  });

  it('treats post-ER specialist help as in-scope instead of an out-of-scope redirect', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('If I go ER can your clinic still help me later with specialist?'),
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'REDIRECT', target: 'service_scope', reasonCode: 'out_of_scope' },
      }),
    };

    const result = await adapter.answer({
      task,
      plan: { query: 'ER later specialist help', reason: 'service scope' },
      matches: [],
      details: [],
    });

    expect(result.answer).toContain('After urgent care');
    expect(result.answer).toContain('specialist');
    expect(result.answer).not.toContain('outside Medora');
  });

  it('answers early nerve-pain doctor requests as guidance instead of pretending a doctor match is ready', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('Can you just recommend a doctor for nerve pain? I do not know what department, maybe bone?'),
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      primaryAction: { type: 'ANSWER', target: 'hospital', mode: 'faq' },
      loadedSkillSections: [{
        skillId: 'hospital_skill',
        role: 'primary',
        reasonCode: 'early_doctor_matching_question',
        sectionIds: ['hospital_doctor_recommendation_policy'],
        readIntentTypes: ['DOCTOR_MATCHING_CONTEXT'],
        policyText: ['Specific doctor matching requires records review before human recommendation.'],
        retrievalGuidance: [],
        handlingGuidance: [],
      }],
    };

    await expect(adapter.answer({
      task,
      plan: { query: 'doctor for nerve pain', reason: 'early doctor matching question' },
      matches: [],
      details: [],
    })).resolves.toEqual({
      answer: expect.stringContaining('burning, electric, or numb leg pain'),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    });
  });

  it('passes rejection and hesitation task rules through FAQ prompts', () => {
    const task: FaqWorkerTask = {
      ...createFaqTask('太贵了，我先考虑一下'),
      ...resolveFaqTaskPolicy({
        primaryAction: { type: 'HANDLE_RESPONSE', target: 'pricing', modifier: 'hesitate' },
      }),
    };

    expect(buildFaqPlanPrompt({ task })).toContain('response_mode=rejection_or_hesitation');
    expect(buildFaqAnswerPrompt({
      task,
      plan: { query: 'hesitation', reason: 'rejection side path' },
      matches: [],
      details: [],
    })).toContain('output_rules=acknowledge_without_pressure, preserve_primary_stage, offer_one_lower_friction_next_step');
  });

  it('renders legacy-shaped stage labels without undefined values in FAQ prompts', () => {
    const task = {
      agent: 'FaqAgent',
      fromStage: 'EXPLAIN_PROCESS',
      toStage: 'COLLECT_MEDICAL_INPUTS',
      latestUserMessage: 'How does the process work?',
      intent: 'faq',
      supervisorReason: 'legacy route-adapter fixture',
    } as unknown as FaqWorkerTask;

    const planPrompt = buildFaqPlanPrompt({ task });
    const answerPrompt = buildFaqAnswerPrompt({
      task,
      plan: { query: 'process', reason: 'legacy stage compatibility' },
      matches: [],
      details: [],
    });

    expect(planPrompt).toContain('current_stage=EXPLAIN_PROCESS');
    expect(planPrompt).toContain('primary_stage=COLLECT_MEDICAL_INPUTS');
    expect(planPrompt).not.toContain('current_stage=undefined');
    expect(planPrompt).not.toContain('primary_stage=undefined');
    expect(answerPrompt).toContain('current_stage=EXPLAIN_PROCESS');
    expect(answerPrompt).toContain('primary_stage=COLLECT_MEDICAL_INPUTS');
    expect(answerPrompt).not.toContain('current_stage=undefined');
    expect(answerPrompt).not.toContain('primary_stage=undefined');
  });

  it('renders legacy string read intents in FAQ prompts', () => {
    const task = {
      ...createFaqTask('How does the process work?'),
      readIntents: ['GENERAL_FAQ'] as unknown as FaqWorkerTask['readIntents'],
    };

    expect(() => buildFaqPlanPrompt({ task })).not.toThrow();
    expect(buildFaqPlanPrompt({ task })).toContain('read_intents=GENERAL_FAQ');
    expect(() => buildFaqAnswerPrompt({
      task,
      plan: { query: 'process', reason: 'legacy read intent compatibility' },
      matches: [],
      details: [],
    })).not.toThrow();
    expect(buildFaqAnswerPrompt({
      task,
      plan: { query: 'process', reason: 'legacy read intent compatibility' },
      matches: [],
      details: [],
    })).toContain('read_intents=GENERAL_FAQ');
  });

  it('passes turn plan skill context through FAQ prompts', () => {
    const task: FaqWorkerTask = {
      ...createFaqTask('How long does online consultation usually take to schedule?'),
      primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' },
      followUpAction: {
        type: 'GO_DEEP',
        target: 'consult',
        reasonCode: 'user_requested_more_detail',
      },
      allowedSkillPacks: [
        'search_general_faq_by_category',
        'answer_general_faq_from_admin_source',
        'load_consult_readiness_criteria',
      ],
      loadedSkillSections: [{
        skillId: 'policy_skill',
        role: 'primary',
        reasonCode: 'answer_consult_faq',
        sectionIds: ['consult_readiness', 'consult_sources'],
        readIntentTypes: ['CONSULT_READINESS', 'GENERAL_FAQ'],
        policyText: ['Explain what is needed before doctor review and which records help readiness.'],
        retrievalGuidance: ['Use consult readiness first; use consult policy content for direct policy questions.'],
        handlingGuidance: ['Explain the consult step and invite the next readiness action.'],
      }],
      readIntents: [
        { type: 'GENERAL_FAQ', category: 'consult', reasonCode: 'answer_consult_faq' },
        { type: 'CONSULT_READINESS', reasonCode: 'go_deep_consult' },
      ],
      responseContract: {
        structure: 'answer_then_advance',
        primaryMove: 'answer',
        followUpMove: 'go_deep',
        constraints: {
          maxQuestions: 1,
          preservePrimaryStage: false,
          answerBeforeAsk: true,
          avoidMultipleCTAs: true,
          language: 'zh',
          tone: 'warm_professional',
        },
        safetyRules: [],
      },
    };

    const planPrompt = buildFaqPlanPrompt({ task });
    expect(planPrompt).toContain('loaded_skill_sections=');
    expect(planPrompt).toContain('consult_readiness');
    expect(planPrompt).toContain('Explain what is needed before doctor review and which records help readiness.');
    expect(planPrompt).toContain('Use consult readiness first; use consult policy content for direct policy questions.');
    expect(planPrompt).toContain('Explain the consult step and invite the next readiness action.');
    expect(planPrompt).toContain('"readIntentTypes":["CONSULT_READINESS","GENERAL_FAQ"]');
    expect(planPrompt).not.toContain('allowed_skill_packs=');
    expect(buildFaqPlanPrompt({ task })).toContain('current_stage=EXPLAIN_PROCESS');
    expect(buildFaqPlanPrompt({ task })).toContain('primary_stage=EXPLAIN_PROCESS');
    expect(buildFaqPlanPrompt({ task })).not.toContain('from_stage=undefined');
    expect(buildFaqPlanPrompt({ task })).not.toContain('to_stage=undefined');
    expect(buildFaqPlanPrompt({ task })).not.toContain('[object Object]');
    expect(buildFaqPlanPrompt({ task })).toContain('read_intents={"type":"GENERAL_FAQ","category":"consult","reasonCode":"answer_consult_faq"}, {"type":"CONSULT_READINESS","reasonCode":"go_deep_consult"}');
    expect(buildFaqPlanPrompt({ task })).toContain('conversation_summary=Earlier: user selected hospital-1 and asked about consult timing.');
    expect(buildFaqPlanPrompt({ task })).toContain('recent_messages=[{"id":"m-1","role":"USER","content":"I selected Shanghai Chest Hospital.","createdAt":"2026-04-29T07:00:00.000Z"},{"id":"m-2","role":"ASSISTANT","content":"I can explain the next consult step.","createdAt":"2026-04-29T07:01:00.000Z"}]');
    const answerPrompt = buildFaqAnswerPrompt({
      task,
      plan: { query: 'consult timing', reason: 'consult faq' },
      matches: [],
      details: [],
    });
    expect(answerPrompt).toContain('loaded_skill_sections=');
    expect(answerPrompt).not.toContain('allowed_skill_packs=');
    expect(answerPrompt).toContain('"followUpMove":"go_deep"');
    expect(answerPrompt).toContain('conversation_summary=Earlier: user selected hospital-1 and asked about consult timing.');
    expect(answerPrompt).toContain('recent_messages=[{"id":"m-1","role":"USER","content":"I selected Shanghai Chest Hospital.","createdAt":"2026-04-29T07:00:00.000Z"},{"id":"m-2","role":"ASSISTANT","content":"I can explain the next consult step.","createdAt":"2026-04-29T07:01:00.000Z"}]');
    expect(buildFaqAnswerPrompt({
      task,
      plan: { query: 'consult timing', reason: 'consult faq' },
      matches: [],
      details: [],
    })).not.toContain('[object Object]');
  });
});

describe('FaqAgent', () => {
  it('answers from loaded domain skill context without calling FAQ retrieval tools', async () => {
    const categorySearch = vi.fn(async () => ({
      categories: [{ name: 'Online Consultation', sortOrder: 1 }],
    }));
    const search = vi.fn(async () => ({
      hits: [{
        id: 'faq-1',
        question: 'How long does online consultation take?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Online Consultation',
      }],
    }));
    const getByIds = vi.fn(async () => ({
      items: [{
        id: 'faq-1',
        question: 'How long does online consultation take?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Online Consultation',
      }],
    }));
    const gateway = createToolGateway({
      handlers: {
        faq: {
          categorySearch,
          search,
          getByIds,
        },
      },
    });
    const adapter = new FaqLlmAdapter({
      plan: {
        promptVersion: 'faq-plan-test',
        run: vi.fn(async () => ({
          query: 'online consultation timing',
          reason: 'user is asking about timing',
        })),
      },
      answer: {
        promptVersion: 'faq-answer-test',
        run: vi.fn(async () => ({
          answer: 'Online consultation timing is confirmed by the coordinator after the case direction is clear.',
          citedFaqIds: [],
          confidence: 'high',
          policyGrounded: true,
        })),
      },
    });
    const agent = new FaqAgent(gateway, adapter);

    const result = await agent.execute({
      type: 'faq.answer',
      input: {
        latestUserMessage: 'How long does online consultation take to arrange?',
        sessionId: 'session-faq-1',
        hospitalId: 'hospital-123',
      },
      meta: {
        task: createFaqTask('How long does online consultation take to arrange?'),
      },
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: false,
      schemaValidationFailed: false,
    });
    expect(categorySearch).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(getByIds).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ok',
      data: {
        answer: 'Online consultation timing is confirmed by the coordinator after the case direction is clear.',
        citedFaqIds: [],
        confidence: 'high',
        policyGrounded: true,
      },
    });
  });

  it('falls back safely when the faq answer output is invalid', async () => {
    const search = vi.fn(async () => ({
      hits: [{
        id: 'faq-2',
        question: 'Can I schedule a consult after records review?',
        answer: 'Yes. We can help arrange the consult after your records are reviewed.',
        category: 'Online Consultation',
      }],
    }));
    const gateway = createToolGateway({
      handlers: {
        faq: {
          search,
        },
      },
    });
    const adapter = new FaqLlmAdapter({
      plan: {
        promptVersion: 'faq-plan-test',
        run: vi.fn(async () => ({
          category: 'Online Consultation',
          query: 'schedule consult after review',
          reason: 'timing follow-up',
        })),
      },
      answer: {
        promptVersion: 'faq-answer-test',
        run: vi.fn(async () => ({
          answer: '',
          citedFaqIds: 'faq-2',
          confidence: 'extreme',
        })),
      },
    });
    const agent = new FaqAgent(gateway, adapter);

    const result = await agent.execute({
      type: 'faq.answer',
      input: {
        latestUserMessage: 'Can I schedule a consult after the records review?',
        sessionId: 'session-faq-2',
      },
      meta: {
        task: createFaqTask('Can I schedule a consult after the records review?'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        answer: expect.stringContaining('could not find an exact FAQ answer'),
        citedFaqIds: [],
        confidence: 'low',
      },
    });
    expect(search).not.toHaveBeenCalled();
  });
});
