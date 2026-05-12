import { describe, expect, it } from 'vitest';
import { loadSkillPacks, loadSkillSections } from '../../chatbot-v3/skill-loader.js';
import { DOMAIN_SKILL_REGISTRY } from '../../chatbot-v3/skill-packs.js';
import type { DomainSkillRequest, LoadedSkillPack } from '../../chatbot-v3/skill-packs.js';

const legacyShapedDomainSkill = {
  id: 'pricing_skill' as const,
  kind: 'retrieval_strategy' as const,
  description: 'pricing',
  reasonCodes: ['pricing'],
};

// @ts-expect-error Domain ids must not be assignable through legacy-shaped variables.
const _invalidDomainLoadedSkillFromVariable: LoadedSkillPack = legacyShapedDomainSkill;

describe('DOMAIN_SKILL_REGISTRY', () => {
  it('contains exactly the Phase 1.2 domain skills', () => {
    expect(Object.keys(DOMAIN_SKILL_REGISTRY).sort()).toEqual([
      'clarification_recovery_skill',
      'handoff_skill',
      'hospital_skill',
      'medical_advice_skill',
      'payment_skill',
      'pricing_skill',
      'policy_skill',
      'sales_skill',
      'service_scope_skill',
      'travel_skill',
      'treatment_skill',
    ].sort());
  });

  it('keeps each domain skill sectionable without heavy prompt fields', () => {
    for (const skill of Object.values(DOMAIN_SKILL_REGISTRY)) {
      expect(skill).toHaveProperty('policySections');
      expect(skill).toHaveProperty('retrieval.sections');
      expect(skill).toHaveProperty('handling');
      expect(skill).not.toHaveProperty('examples');
      expect(skill).not.toHaveProperty('requiredBehaviors');
      expect(skill).not.toHaveProperty('forbiddenBehaviors');
    }
  });

  it('contains required detailed Medora policy anchors', () => {
    const allPolicyText = (skillId: keyof typeof DOMAIN_SKILL_REGISTRY) =>
      DOMAIN_SKILL_REGISTRY[skillId].policySections.map((section) => section.text).join('\n');

    expect(allPolicyText('service_scope_skill')).toContain('RM H2 4/F CENTURY IND CTR');
    expect(allPolicyText('service_scope_skill')).toContain('US +1 4708613825');
    expect(allPolicyText('service_scope_skill')).toContain('contact@medicaltourismchina.health');

    expect(allPolicyText('policy_skill')).toContain('USD 400');
    expect(allPolicyText('policy_skill')).toContain('within 48 hours');
    expect(allPolicyText('policy_skill')).toContain('does not provide claims support');

    expect(allPolicyText('medical_advice_skill')).toContain('online consultation');
    expect(allPolicyText('hospital_skill')).toContain('hospital API');
    expect(allPolicyText('hospital_skill')).toContain('specific doctor');
    expect(allPolicyText('treatment_skill')).toContain('required step before coming to China');
    expect(allPolicyText('treatment_skill')).toContain('within 48 hours');

    expect(allPolicyText('pricing_skill')).toContain('Hospital medical cost vs Medora service fee');
    expect(allPolicyText('payment_skill')).toContain('Payee distinction');
    expect(allPolicyText('travel_skill')).toContain('medical path first');
    expect(allPolicyText('sales_skill')).toContain('low-friction');
    expect(allPolicyText('handoff_skill')).toContain('Handoff summary');
    expect(allPolicyText('clarification_recovery_skill')).toContain('Safe-assumption');
  });
});

describe('loadSkillPacks', () => {
  const domainRequest = (
    skillId: DomainSkillRequest['skillId'],
    reasonCode: string,
  ): DomainSkillRequest => ({
    skillId,
    role: 'primary',
    reasonCode,
    sectionHints: {
      eventType: 'USER_ASKED_QUESTION',
      target: skillId === 'policy_skill' ? 'process' : 'pricing',
      modifier: 'ask',
      primaryActionType: 'ANSWER',
    },
  });

  it('loads domain skill request objects emitted by the router', () => {
    const loaded = loadSkillPacks({
      requests: [
        {
          skillId: 'pricing_skill',
          role: 'primary',
          reasonCode: 'answer_pricing_question',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'pricing',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
      maxSkillSnippets: 6,
    });

    expect(loaded.skillPacks).toEqual([
      expect.objectContaining({
        id: 'pricing_skill',
        target: 'pricing',
        description: expect.any(String),
        reasonCodes: ['answer_pricing_question'],
      }),
    ]);
    expect(loaded.skillPacks[0]).toHaveProperty('policySections');
    expect(loaded.warnings).toEqual([]);
  });

  it('loads code-defined domain skills from the in-memory registry only', () => {
    const loaded = loadSkillPacks({
      requests: [
        domainRequest('service_scope_skill', 'out_of_scope'),
        domainRequest('service_scope_skill', 'duplicate'),
        domainRequest('treatment_skill', 'records'),
      ],
      maxSkillSnippets: 6,
    });

    expect(loaded.skillPacks.map((skill) => skill.id)).toEqual([
      'service_scope_skill',
      'treatment_skill',
    ]);
    expect(loaded.warnings).toEqual([]);
    expect(DOMAIN_SKILL_REGISTRY.service_scope_skill.target).toBe('service_scope');
    expect(DOMAIN_SKILL_REGISTRY.treatment_skill.target).toBe('treatment');
  });

  it('caps loaded domain skills', () => {
    const loaded = loadSkillPacks({
      requests: [
        domainRequest('pricing_skill', 'pricing'),
        domainRequest('service_scope_skill', 'safety'),
        domainRequest('policy_skill', 'process'),
      ],
      maxSkillSnippets: 2,
    });

    expect(loaded.skillPacks.map((skill) => skill.id)).toEqual([
      'pricing_skill',
      'service_scope_skill',
    ]);
    expect(loaded.skillPacks[0]).toEqual(expect.objectContaining({
      id: 'pricing_skill',
      target: 'pricing',
      description: expect.any(String),
      reasonCodes: ['pricing'],
    }));
    expect(loaded.skillPacks[0]).toHaveProperty('policySections');
    expect(loaded.warnings).toEqual([]);
  });

  it('falls back from unknown ids to a valid domain safe recovery skill', () => {
    const loaded = loadSkillPacks({
      requests: [
        domainRequest('missing_skill' as never, 'bad'),
      ],
      maxSkillSnippets: 6,
    });

    expect(loaded.skillPacks).toEqual([
      expect.objectContaining({
        id: 'clarification_recovery_skill',
        target: 'clarification',
        description: expect.any(String),
        reasonCodes: ['bad'],
      }),
    ]);
    expect(loaded.skillPacks[0]?.description).not.toBe('');
    expect(loaded.warnings).toContain('unknown skill pack: missing_skill');
  });
});

describe('loadSkillSections', () => {
  const pricingRequest: DomainSkillRequest = {
    skillId: 'pricing_skill',
    role: 'primary',
    reasonCode: 'answer_pricing_question',
    sectionHints: {
      eventType: 'USER_ASKED_QUESTION',
      target: 'pricing',
      modifier: 'ask',
      primaryActionType: 'ANSWER',
    },
  };

  const documentsAuxiliaryRequest: DomainSkillRequest = {
    skillId: 'treatment_skill',
    role: 'auxiliary',
    reasonCode: 'pricing_requires_records',
    sectionHints: {
      eventType: 'USER_ASKED_QUESTION',
      target: 'treatment',
      modifier: 'ask',
      primaryActionType: 'ANSWER',
      followUpActionType: 'INVITE_NEXT_STEP',
    },
  };

  it('loads two requested domain skill sections while trimming pricing to matching sections', () => {
    const loaded = loadSkillSections({
      requests: [pricingRequest, documentsAuxiliaryRequest],
    });

    expect(loaded.skillSections).toHaveLength(2);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.skillSections[0]).toMatchObject({
      skillId: 'pricing_skill',
      role: 'primary',
      reasonCode: 'answer_pricing_question',
    });
    expect(loaded.skillSections[0]?.sectionIds.length).toBeGreaterThan(0);
    expect(loaded.skillSections[0]?.sectionIds.length).toBeLessThan(
      DOMAIN_SKILL_REGISTRY.pricing_skill.policySections.length + 1,
    );
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('pricing');
    expect(loaded.skillSections[0]?.retrievalGuidance).toEqual([
      expect.stringContaining('pricing factors'),
    ]);
    expect(loaded.skillSections[0]?.handlingGuidance).toEqual([
      expect.stringContaining('pricing question'),
    ]);
    expect(loaded.skillSections[1]).toMatchObject({
      skillId: 'treatment_skill',
      role: 'auxiliary',
      reasonCode: 'pricing_requires_records',
    });
  });

  it('selects document rejection handling from section hints', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'treatment_skill',
          role: 'primary',
          reasonCode: 'documents_rejected',
          sectionHints: {
            eventType: 'USER_RESPONDED_TO_REQUEST',
            target: 'treatment',
            modifier: 'reject',
            primaryActionType: 'HANDLE_RESPONSE',
          },
        },
      ],
    });

    expect(loaded.skillSections).toHaveLength(1);
    expect(loaded.skillSections[0]?.sectionIds).toEqual(expect.arrayContaining([
      'documents_request_scope',
      'documents_lower_friction',
      'treatment_requirements',
      'USER_RESPONDED_TO_REQUEST.reject',
    ]));
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('alternatives');
    expect(loaded.skillSections[0]?.retrievalGuidance).toEqual([
      expect.stringContaining('record requirements'),
    ]);
    expect(loaded.skillSections[0]?.handlingGuidance).toEqual([
      expect.stringContaining('Respect the choice'),
    ]);
  });

  it('loads upload-review promise on deterministic document upload turns', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'treatment_skill',
          role: 'primary',
          reasonCode: 'documents_uploaded',
          sectionHints: {
            eventType: 'DOCUMENTS_UPLOADED',
            target: 'documents',
            modifier: 'provide',
            primaryActionType: 'REQUEST_INFO',
          },
        },
      ],
    });

    expect(loaded.skillSections).toHaveLength(1);
    expect(loaded.skillSections[0]?.sectionIds).toEqual(expect.arrayContaining([
      'documents_upload_review_promise',
      'DOCUMENTS_UPLOADED.provide',
    ]));
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('Medora human team will review');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('within 48 hours');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('Do not imply the chatbot has clinically reviewed');
  });

  it('loads detailed sections for canonical service scope and handoff requests', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'handoff_skill',
          role: 'primary',
          reasonCode: 'canonical_handoff',
          sectionHints: {
            eventType: 'USER_REQUESTED_HUMAN',
            target: 'handoff',
            modifier: 'ask',
            primaryActionType: 'ESCALATE',
          },
        },
        {
          skillId: 'service_scope_skill',
          role: 'auxiliary',
          reasonCode: 'canonical_service_scope',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'service_scope',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
    });

    expect(loaded.skillSections).toHaveLength(2);
    expect(loaded.warnings).toEqual([]);

    const handoff = loaded.skillSections[0];
    expect(handoff).toMatchObject({
      skillId: 'handoff_skill',
      reasonCode: 'canonical_handoff',
    });
    expect(handoff?.sectionIds).toEqual(expect.arrayContaining([
      'handoff_readiness',
      'handoff_minimum_context',
      'handoff_summary_payload',
    ]));
    expect(handoff?.policyText.join('\n')).toContain('Handoff summary');

    const serviceScope = loaded.skillSections[1];
    expect(serviceScope).toMatchObject({
      skillId: 'service_scope_skill',
      reasonCode: 'canonical_service_scope',
    });
    expect(serviceScope?.sectionIds).toEqual(expect.arrayContaining([
      'service_scope_identity_contact',
      'service_scope_catalog',
      'service_scope_boundary',
    ]));
    expect(serviceScope?.policyText.join('\n')).toContain('RM H2 4/F CENTURY IND CTR');
    expect(serviceScope?.policyText.join('\n')).toContain('Service catalog');
  });

  it('loads focused Medora policy essentials for canonical policy requests', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'policy_skill',
          role: 'primary',
          reasonCode: 'canonical_policy',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'policy',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
    });

    expect(loaded.skillSections).toHaveLength(1);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.skillSections[0]?.sectionIds).toEqual(expect.arrayContaining([
      'policy_online_consultation',
      'policy_document_review',
      'policy_insurance_boundary',
    ]));
    expect(loaded.skillSections[0]?.sectionIds).not.toContain('process_travel_scope');
    expect(loaded.skillSections[0]?.sectionIds).not.toContain('process_payment_scope');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('USD 400');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('within 48 hours');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('does not provide claims support');
  });

  it('exposes structured read intent types from matching retrieval sections', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'hospital_skill',
          role: 'primary',
          reasonCode: 'recommend_hospital',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'hospital',
            modifier: 'ask',
            primaryActionType: 'PRESENT_OPTIONS',
          },
        },
      ],
    });

    expect(loaded.skillSections[0]?.sectionIds).toContain('hospital_sources');
    expect(loaded.skillSections[0]?.readIntentTypes).toEqual([
      'HOSPITAL_CANDIDATES',
      'HOSPITAL_FAQ',
      'DOCTOR_MATCHING_CONTEXT',
    ]);
  });

  it('loads medical advice subtype guidance without blanket dismissal', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'medical_advice_skill',
          role: 'primary',
          reasonCode: 'medical_advice_boundary',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'medical_advice',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
    });

    expect(loaded.skillSections).toHaveLength(1);
    expect(loaded.skillSections[0]?.sectionIds).toEqual(expect.arrayContaining([
      'medical_advice_triage_or_urgency',
      'medical_advice_specialty_or_department',
      'medical_advice_diagnosis_uncertainty',
      'medical_advice_medication_or_prescription',
      'medical_advice_treatment_decision',
      'medical_advice_outcome_guarantee',
    ]));
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('red-flag symptoms');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('specialty_or_department_question');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('trigeminal');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('pregabalin');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('second opinion');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('guarantee cure');
    expect(loaded.skillSections[0]?.handlingGuidance.join('\n')).toContain('Do not blanket dismiss');
  });

  it('loads medical red-flag policy for medical-safety redirects without service-scope retrieval', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'medical_advice_skill',
          role: 'primary',
          reasonCode: 'medical_safety',
          sectionHints: {
            eventType: 'USER_REQUESTED_ACTION',
            target: 'medical_advice',
            modifier: 'request_action',
            primaryActionType: 'REDIRECT',
          },
        },
      ],
    });

    expect(loaded.skillSections).toHaveLength(1);
    expect(loaded.skillSections[0]?.sectionIds).toEqual(expect.arrayContaining([
      'medical_safety_boundary',
      'medical_preliminary_orientation',
      'medical_red_flags',
      'medical_advice_triage_or_urgency',
    ]));
    expect(loaded.skillSections[0]?.readIntentTypes).not.toContain('SERVICE_SCOPE');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('chest pain');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('local emergency or urgent medical care first');
  });

  it('loads detailed process guidance for canonical policy detours', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'policy_skill',
          role: 'primary',
          reasonCode: 'answer_process_question',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'policy',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
    });

    expect(loaded.skillSections).toHaveLength(1);
    expect(loaded.skillSections[0]?.sectionIds).toEqual(expect.arrayContaining([
      'process_answer_and_return',
      'process_stage_preservation',
      'process_overview_boundary',
      'process_next_step_routing',
      'process_timeline_boundary',
    ]));
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('formal overview');
    expect(loaded.skillSections[0]?.policyText.join('\n')).toContain('journey stage');
    expect(loaded.skillSections[0]?.handlingGuidance.join('\n')).toContain('Answer the detour');
  });

  it('makes unknown domain skill fallback observable and uses clarification recovery for ambiguous unknowns', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'missing_skill',
          role: 'primary',
          reasonCode: 'ambiguous_unknown',
          sectionHints: {
            eventType: 'USER_MESSAGE_UNCLEAR',
            target: 'unknown',
            modifier: 'unknown',
            primaryActionType: 'CLARIFY',
          },
        } as never,
      ],
    });

    expect(loaded.warnings).toContainEqual(expect.stringContaining('unknown skill'));
    expect(loaded.warnings).toContainEqual(expect.stringContaining('clarification_recovery_skill'));
    expect(loaded.skillSections).toEqual([
      expect.objectContaining({
        skillId: 'clarification_recovery_skill',
        role: 'primary',
        reasonCode: 'ambiguous_unknown',
      }),
    ]);
  });

  it('uses clarification fallback with warnings for unknown skills missing section hints', () => {
    const missingHintsRequest = {
      skillId: 'missing_skill',
      role: 'primary',
      reasonCode: 'missing_hints_unknown',
    } as never;
    const nullHintsRequest = {
      skillId: 'missing_skill',
      role: 'auxiliary',
      reasonCode: 'null_hints_unknown',
      sectionHints: null,
    } as never;

    const loaded = loadSkillSections({
      requests: [missingHintsRequest, nullHintsRequest],
    });

    expect(loaded.warnings).toContainEqual(expect.stringContaining('malformed sectionHints'));
    expect(loaded.warnings).toContainEqual(expect.stringContaining('unknown skill'));
    expect(loaded.warnings).toContainEqual(expect.stringContaining('clarification_recovery_skill'));
    expect(loaded.skillSections).toHaveLength(2);
    expect(loaded.skillSections).toEqual([
      expect.objectContaining({
        skillId: 'clarification_recovery_skill',
        role: 'primary',
        reasonCode: 'missing_hints_unknown',
      }),
      expect.objectContaining({
        skillId: 'clarification_recovery_skill',
        role: 'auxiliary',
        reasonCode: 'null_hints_unknown',
      }),
    ]);
  });

  it('uses clarification fallback with warnings for known skills missing section hints', () => {
    const missingHintsRequest = {
      skillId: 'pricing_skill',
      role: 'primary',
      reasonCode: 'missing_hints_known',
    } as never;
    const nullHintsRequest = {
      skillId: 'pricing_skill',
      role: 'auxiliary',
      reasonCode: 'null_hints_known',
      sectionHints: null,
    } as never;

    const loaded = loadSkillSections({
      requests: [missingHintsRequest, nullHintsRequest],
    });

    expect(loaded.warnings).toContainEqual(expect.stringContaining('malformed sectionHints'));
    expect(loaded.warnings).toContainEqual(expect.stringContaining('clarification_recovery_skill'));
    expect(loaded.skillSections).toHaveLength(2);
    expect(loaded.skillSections).toEqual([
      expect.objectContaining({
        skillId: 'clarification_recovery_skill',
        role: 'primary',
        reasonCode: 'missing_hints_known',
      }),
      expect.objectContaining({
        skillId: 'clarification_recovery_skill',
        role: 'auxiliary',
        reasonCode: 'null_hints_known',
      }),
    ]);
    for (const section of loaded.skillSections) {
      expect(section.sectionIds.length).toBeGreaterThan(0);
      expect(section.policyText.join('\n')).not.toBe('');
      expect(section.handlingGuidance.join('\n')).not.toBe('');
    }
  });

  it('caps loaded skill sections at two', () => {
    const loaded = loadSkillSections({
      requests: [
        pricingRequest,
        documentsAuxiliaryRequest,
        {
          skillId: 'policy_skill',
          role: 'auxiliary',
          reasonCode: 'process_detour',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'policy',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
    });

    expect(loaded.skillSections.map((section) => section.skillId)).toEqual([
      'pricing_skill',
      'treatment_skill',
    ]);
  });

  it('loads zero skill sections for a negative section budget', () => {
    const loaded = loadSkillSections({
      requests: [
        pricingRequest,
        documentsAuxiliaryRequest,
        {
          skillId: 'policy_skill',
          role: 'auxiliary',
          reasonCode: 'process_detour',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'policy',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
      maxSkillSections: -1,
    });

    expect(loaded.skillSections).toEqual([]);
    expect(loaded.warnings).toEqual([]);
  });
});
