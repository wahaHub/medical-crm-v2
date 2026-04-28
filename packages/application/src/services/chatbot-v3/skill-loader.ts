import {
  DOMAIN_SKILL_REGISTRY,
  SKILL_LOADER_REGISTRY,
  type DomainSkillRequest,
  type DomainSkillId,
  type DomainSkillPack,
  type LoadedSkillSection,
  type LoadedSkillPack,
  type SkillSectionApplicability,
  type SkillPackId,
  type SkillRequest,
} from './skill-packs.js';
import {
  SUPERVISOR_EVENT_MODIFIERS,
  SUPERVISOR_EVENT_TARGETS,
  SUPERVISOR_EVENT_TYPES,
} from './supervisor-event.types.js';

export interface LoadSkillPacksInput {
  requests: readonly (DomainSkillRequest | SkillRequest)[];
  maxSkillSnippets?: number;
}

export interface LoadedSkillPolicy {
  skillPacks: LoadedSkillPack[];
  warnings: string[];
}

export interface LoadSkillSectionsInput {
  requests: readonly DomainSkillRequest[];
  maxSkillSections?: number;
}

export interface LoadedSkillSectionsPolicy {
  skillSections: LoadedSkillSection[];
  warnings: string[];
}

interface NormalizedDomainSkillRequest {
  request: DomainSkillRequest;
  usedFallbackDefaults: boolean;
}

const DEFAULT_CLARIFICATION_SECTION_HINTS: DomainSkillRequest['sectionHints'] = {
  eventType: 'USER_MESSAGE_UNCLEAR',
  target: 'unknown',
  modifier: 'unknown',
  primaryActionType: 'CLARIFY',
};

const PRIMARY_ACTION_TYPES = [
  'ANSWER',
  'ACKNOWLEDGE',
  'CLARIFY',
  'REQUEST_INFO',
  'PRESENT_OPTIONS',
  'HANDLE_RESPONSE',
  'REDIRECT',
  'ESCALATE',
] as const;

const FOLLOW_UP_ACTION_TYPES = [
  'INVITE_NEXT_STEP',
  'ASK_QUALIFYING_QUESTION',
  'GO_DEEP',
  'NONE',
] as const;

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

export function loadSkillSections(input: LoadSkillSectionsInput): LoadedSkillSectionsPolicy {
  const maxSkillSections = clampSectionBudget(input.maxSkillSections ?? 2);
  const warnings: string[] = [];

  const skillSections = input.requests.slice(0, maxSkillSections).map((request) => {
    const normalized = normalizeDomainSkillRequest(request, warnings);
    const normalizedRequest = normalized.request;
    const skillId = resolveDomainSkillId(normalizedRequest, warnings);
    const fallbackSkillId = normalized.usedFallbackDefaults && skillId === normalizedRequest.skillId
      ? resolveFallbackSkillId(normalizedRequest)
      : skillId;
    if (fallbackSkillId !== skillId) {
      warnings.push(
        `malformed sectionHints for ${String(request.skillId)}; falling back to ${fallbackSkillId}`,
      );
    }
    const resolvedRequest = fallbackSkillId === request.skillId
      ? normalizedRequest
      : { ...normalizedRequest, skillId: fallbackSkillId };

    return loadSingleSkillSection(DOMAIN_SKILL_REGISTRY[fallbackSkillId], resolvedRequest);
  });

  return { skillSections, warnings };
}

function clampSectionBudget(maxSkillSections: number): number {
  if (!Number.isFinite(maxSkillSections)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(maxSkillSections), 2));
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

function resolveDomainSkillId(request: DomainSkillRequest, warnings: string[]): DomainSkillId {
  if (Object.hasOwn(DOMAIN_SKILL_REGISTRY, request.skillId)) {
    return request.skillId;
  }

  const fallbackSkillId = resolveFallbackSkillId(request);
  warnings.push(`unknown skill: ${String(request.skillId)}; falling back to ${fallbackSkillId}`);
  return fallbackSkillId;
}

function normalizeDomainSkillRequest(
  request: DomainSkillRequest,
  warnings: string[],
): NormalizedDomainSkillRequest {
  const hints = request.sectionHints;
  if (!isRecord(hints)) {
    warnings.push(`malformed sectionHints for ${String(request.skillId)}; using clarification-safe defaults`);
    return {
      request: { ...request, sectionHints: DEFAULT_CLARIFICATION_SECTION_HINTS },
      usedFallbackDefaults: true,
    };
  }

  const normalizedHints: DomainSkillRequest['sectionHints'] = {
    eventType: pickAllowed(hints.eventType, SUPERVISOR_EVENT_TYPES, DEFAULT_CLARIFICATION_SECTION_HINTS.eventType),
    target: pickAllowed(hints.target, SUPERVISOR_EVENT_TARGETS, DEFAULT_CLARIFICATION_SECTION_HINTS.target),
    modifier: pickAllowed(hints.modifier, SUPERVISOR_EVENT_MODIFIERS, DEFAULT_CLARIFICATION_SECTION_HINTS.modifier),
    primaryActionType: pickAllowed(
      hints.primaryActionType,
      PRIMARY_ACTION_TYPES,
      DEFAULT_CLARIFICATION_SECTION_HINTS.primaryActionType,
    ),
  };
  const followUpActionType = pickOptionalAllowed(hints.followUpActionType, FOLLOW_UP_ACTION_TYPES);
  if (followUpActionType !== undefined) {
    normalizedHints.followUpActionType = followUpActionType;
  }

  if (
    normalizedHints.eventType !== hints.eventType
    || normalizedHints.target !== hints.target
    || normalizedHints.modifier !== hints.modifier
    || normalizedHints.primaryActionType !== hints.primaryActionType
    || normalizedHints.followUpActionType !== hints.followUpActionType
  ) {
    warnings.push(`malformed sectionHints for ${String(request.skillId)}; using clarification-safe defaults`);
    return {
      request: { ...request, sectionHints: normalizedHints },
      usedFallbackDefaults: true,
    };
  }

  return {
    request: { ...request, sectionHints: normalizedHints },
    usedFallbackDefaults: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function pickOptionalAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T
    : undefined;
}

function shouldUseSafetyFallback(request: DomainSkillRequest): boolean {
  const hints = request.sectionHints;
  return hints?.eventType === 'USER_ASKED_RISKY_MEDICAL_ADVICE'
    || hints?.eventType === 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE'
    || hints?.primaryActionType === 'REDIRECT';
}

function resolveFallbackSkillId(request: DomainSkillRequest): DomainSkillId {
  return shouldUseSafetyFallback(request)
    ? 'safety_scope_skill'
    : 'clarification_recovery_skill';
}

function loadSingleSkillSection(
  skill: DomainSkillPack,
  request: DomainSkillRequest,
): LoadedSkillSection {
  const policySections = skill.policySections.filter((section) => (
    appliesToHints(section.appliesTo, request.sectionHints)
  ));
  const retrievalSections = skill.retrieval.sections.filter((section) => (
    appliesToHints(section.appliesTo, request.sectionHints)
  ));
  const handlingGuidance = loadHandlingGuidance(skill, request);
  const handlingSectionIds = handlingGuidance.length > 0 && request.sectionHints.modifier !== 'ask'
    ? [`${request.sectionHints.eventType}.${request.sectionHints.modifier}`]
    : [];

  return {
    skillId: skill.id,
    role: request.role,
    reasonCode: request.reasonCode,
    sectionIds: [
      ...policySections.map((section) => section.id),
      ...retrievalSections.map((section) => section.id),
      ...handlingSectionIds,
    ],
    policyText: policySections.map((section) => section.text),
    retrievalGuidance: retrievalSections.map((section) => section.searchGuidance),
    handlingGuidance,
  };
}

function appliesToHints(
  appliesTo: SkillSectionApplicability,
  hints: DomainSkillRequest['sectionHints'],
): boolean {
  return matchesOptional(appliesTo.eventTypes, hints.eventType)
    && matchesOptional(appliesTo.targets, hints.target)
    && matchesOptional(appliesTo.modifiers, hints.modifier)
    && matchesOptional(appliesTo.primaryActionTypes, hints.primaryActionType)
    && matchesOptional(appliesTo.followUpActionTypes, hints.followUpActionType);
}

function matchesOptional<T>(allowed: readonly T[] | undefined, value: T | undefined): boolean {
  return allowed === undefined || (value !== undefined && allowed.includes(value));
}

function loadHandlingGuidance(
  skill: DomainSkillPack,
  request: DomainSkillRequest,
): string[] {
  const guidance = skill.handling[request.sectionHints.eventType]?.[request.sectionHints.modifier];
  return guidance === undefined ? [] : [guidance];
}
