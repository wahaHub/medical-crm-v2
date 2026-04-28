import { describe, expect, it } from 'vitest';
import { loadSkillPacks } from '../../chatbot-v3/skill-loader.js';
import { SKILL_PACK_REGISTRY } from '../../chatbot-v3/skill-packs.js';

describe('loadSkillPacks', () => {
  it('loads code-defined skills from the in-memory registry only', () => {
    const loaded = loadSkillPacks({
      requests: [
        { skillPackId: 'service_scope_boundary', reasonCode: 'out_of_scope' },
        { skillPackId: 'service_scope_boundary', reasonCode: 'duplicate' },
        { skillPackId: 'derive_record_inventory_candidate', reasonCode: 'records' },
      ],
      maxSkillSnippets: 6,
    });

    expect(loaded.skillPacks.map((skill) => skill.id)).toEqual([
      'service_scope_boundary',
      'derive_record_inventory_candidate',
    ]);
    expect(loaded.warnings).toEqual([]);
    expect(SKILL_PACK_REGISTRY.service_scope_boundary.kind).toBe('boundary_policy');
    expect(SKILL_PACK_REGISTRY.derive_record_inventory_candidate.kind).toBe('extraction_strategy');
  });

  it('caps loaded skills and falls back safely for unknown ids', () => {
    const loaded = loadSkillPacks({
      requests: [
        { skillPackId: 'missing_skill' as any, reasonCode: 'bad' },
        { skillPackId: 'explain_pricing_uncertainty', reasonCode: 'pricing' },
        { skillPackId: 'medical_safety_boundary', reasonCode: 'safety' },
      ],
      maxSkillSnippets: 2,
    });

    expect(loaded.skillPacks.map((skill) => skill.id)).toEqual([
      'safe_degradation_when_uncertain',
      'explain_pricing_uncertainty',
    ]);
    expect(loaded.warnings).toContain('unknown skill pack: missing_skill');
  });
});
