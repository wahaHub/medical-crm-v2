import { describe, expect, it } from 'vitest';
import { loadSkillPacks, loadSkillSections } from '../../chatbot-v3/skill-loader.js';
import { DOMAIN_SKILL_REGISTRY, SKILL_PACK_REGISTRY } from '../../chatbot-v3/skill-packs.js';
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
      'consult_skill',
      'documents_skill',
      'hospital_recommendation_skill',
      'human_handoff_skill',
      'pricing_skill',
      'process_skill',
      'safety_scope_skill',
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
});

describe('SKILL_PACK_REGISTRY', () => {
  it('keeps the legacy export legacy-shaped for untouched consumers', () => {
    for (const skill of Object.values(SKILL_PACK_REGISTRY)) {
      expect(skill).toHaveProperty('id');
      expect(skill).toHaveProperty('kind');
      expect(skill).toHaveProperty('description');
    }
  });
});

describe('loadSkillPacks', () => {
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
        { skillPackId: 'safety_scope_skill', reasonCode: 'out_of_scope' },
        { skillPackId: 'safety_scope_skill', reasonCode: 'duplicate' },
        { skillPackId: 'documents_skill', reasonCode: 'records' },
      ],
      maxSkillSnippets: 6,
    });

    expect(loaded.skillPacks.map((skill) => skill.id)).toEqual([
      'safety_scope_skill',
      'documents_skill',
    ]);
    expect(loaded.warnings).toEqual([]);
    expect(DOMAIN_SKILL_REGISTRY.safety_scope_skill.target).toBe('safety_scope');
    expect(DOMAIN_SKILL_REGISTRY.documents_skill.target).toBe('documents');
  });

  it('caps loaded domain skills', () => {
    const loaded = loadSkillPacks({
      requests: [
        { skillPackId: 'pricing_skill', reasonCode: 'pricing' },
        { skillPackId: 'safety_scope_skill', reasonCode: 'safety' },
        { skillPackId: 'process_skill', reasonCode: 'process' },
      ],
      maxSkillSnippets: 2,
    });

    expect(loaded.skillPacks.map((skill) => skill.id)).toEqual([
      'pricing_skill',
      'safety_scope_skill',
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

  it('loads legacy skill ids with their legacy metadata for untouched consumers', () => {
    const loaded = loadSkillPacks({
      requests: [
        { skillPackId: 'search_general_faq_by_category', reasonCode: 'faq' },
      ],
      maxSkillSnippets: 6,
    });

    expect(loaded.skillPacks).toEqual([
      expect.objectContaining({
        id: 'search_general_faq_by_category',
        kind: 'retrieval_strategy',
        description: expect.any(String),
        reasonCodes: ['faq'],
      }),
    ]);
    expect(loaded.skillPacks[0]?.description).not.toBe('');
    expect(loaded.warnings).toEqual([]);
  });

  it('falls back from unknown ids to a valid legacy safe degradation skill', () => {
    const loaded = loadSkillPacks({
      requests: [
        { skillPackId: 'missing_skill' as never, reasonCode: 'bad' },
      ],
      maxSkillSnippets: 6,
    });

    expect(loaded.skillPacks).toEqual([
      expect.objectContaining({
        id: 'safe_degradation_when_uncertain',
        kind: 'degradation_policy',
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
    skillId: 'documents_skill',
    role: 'auxiliary',
    reasonCode: 'pricing_requires_records',
    sectionHints: {
      eventType: 'USER_ASKED_QUESTION',
      target: 'documents',
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
      skillId: 'documents_skill',
      role: 'auxiliary',
      reasonCode: 'pricing_requires_records',
    });
  });

  it('selects document rejection handling from section hints', () => {
    const loaded = loadSkillSections({
      requests: [
        {
          skillId: 'documents_skill',
          role: 'primary',
          reasonCode: 'documents_rejected',
          sectionHints: {
            eventType: 'USER_RESPONDED_TO_REQUEST',
            target: 'documents',
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
      'document_requirements',
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
            primaryActionType: 'ASK',
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

  it('caps loaded skill sections at two', () => {
    const loaded = loadSkillSections({
      requests: [
        pricingRequest,
        documentsAuxiliaryRequest,
        {
          skillId: 'process_skill',
          role: 'auxiliary',
          reasonCode: 'process_detour',
          sectionHints: {
            eventType: 'USER_ASKED_QUESTION',
            target: 'process',
            modifier: 'ask',
            primaryActionType: 'ANSWER',
          },
        },
      ],
    });

    expect(loaded.skillSections.map((section) => section.skillId)).toEqual([
      'pricing_skill',
      'documents_skill',
    ]);
  });
});
