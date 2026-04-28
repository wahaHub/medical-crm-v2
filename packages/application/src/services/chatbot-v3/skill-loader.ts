import {
  SKILL_PACK_REGISTRY,
  type LoadedSkillPack,
  type SkillPackId,
  type SkillRequest,
} from './skill-packs.js';

export interface LoadSkillPacksInput {
  requests: readonly SkillRequest[];
  maxSkillSnippets?: number;
}

export interface LoadedSkillPolicy {
  skillPacks: LoadedSkillPack[];
  warnings: string[];
}

export function loadSkillPacks(input: LoadSkillPacksInput): LoadedSkillPolicy {
  const maxSkillSnippets = input.maxSkillSnippets ?? 6;
  const requestsBySkill = new Map<SkillPackId, string[]>();
  const warnings: string[] = [];

  for (const request of input.requests) {
    if (!Object.hasOwn(SKILL_PACK_REGISTRY, request.skillPackId)) {
      warnings.push(`unknown skill pack: ${request.skillPackId}`);
      addRequest(requestsBySkill, 'safe_degradation_when_uncertain', request.reasonCode);
      continue;
    }

    addRequest(requestsBySkill, request.skillPackId, request.reasonCode);
  }

  const skillPacks = [...requestsBySkill.entries()]
    .slice(0, maxSkillSnippets)
    .map(([skillPackId, reasonCodes]) => ({
      ...SKILL_PACK_REGISTRY[skillPackId],
      reasonCodes,
    }));

  return { skillPacks, warnings };
}

function addRequest(
  requestsBySkill: Map<SkillPackId, string[]>,
  skillPackId: SkillPackId,
  reasonCode: string,
) {
  const reasonCodes = requestsBySkill.get(skillPackId) ?? [];
  if (!reasonCodes.includes(reasonCode)) {
    reasonCodes.push(reasonCode);
  }
  requestsBySkill.set(skillPackId, reasonCodes);
}
