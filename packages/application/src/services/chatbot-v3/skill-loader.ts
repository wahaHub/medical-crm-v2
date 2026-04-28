import {
  SKILL_LOADER_REGISTRY,
  type DomainSkillRequest,
  type LoadedSkillPack,
  type SkillPackId,
  type SkillRequest,
} from './skill-packs.js';

export interface LoadSkillPacksInput {
  requests: readonly (DomainSkillRequest | SkillRequest)[];
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
    const skillPackId = 'skillId' in request ? request.skillId : request.skillPackId;
    if (!Object.hasOwn(SKILL_LOADER_REGISTRY, skillPackId)) {
      warnings.push(`unknown skill pack: ${skillPackId}`);
      addRequest(requestsBySkill, 'safe_degradation_when_uncertain', request.reasonCode);
      continue;
    }

    addRequest(requestsBySkill, skillPackId, request.reasonCode);
  }

  const skillPacks = [...requestsBySkill.entries()]
    .slice(0, maxSkillSnippets)
    .map(([skillPackId, reasonCodes]) => ({
      ...SKILL_LOADER_REGISTRY[skillPackId],
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
