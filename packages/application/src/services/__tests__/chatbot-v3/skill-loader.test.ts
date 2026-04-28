import { describe, expect, it } from 'vitest';
import { loadSkillPacks } from '../../chatbot-v3/skill-loader.js';
import { DOMAIN_SKILL_REGISTRY } from '../../chatbot-v3/skill-packs.js';

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

describe('loadSkillPacks', () => {
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
    expect(loaded.warnings).toEqual([]);
  });
});
