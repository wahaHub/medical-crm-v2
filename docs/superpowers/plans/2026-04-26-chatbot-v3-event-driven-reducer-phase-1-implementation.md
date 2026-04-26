# Chatbot V3 Event-Driven Reducer Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current supervisor-led proposal contract with an event-driven reducer control plane while keeping existing stages, agents, and presentation surfaces compatible during Phase 1.

**Architecture:** The implementation introduces a deterministic-first plus semantic `SupervisorEvent` extractor, a reducer that becomes the only workflow truth source, a deterministic `NextAction -> agent` resolver, and a thin projection layer that feeds old runtime/composer surfaces without regaining control authority. Existing persisted snapshot fields remain in place, but all new control-plane reads go through normalized facts.

**Tech Stack:** TypeScript, Vitest, OpenAI structured outputs / strict schema, existing `apps/api` chatbot-v3 runtime, existing `packages/application` chatbot-v3 control-plane services.

---

## File Structure

### New or newly central files
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
  - Defines `SupervisorEvent`, `SupervisorEventType`, `JourneyState`, `DomainFacts`, `MedicalFactPatchCandidate`, `NextAction`, `JourneyReduction`.
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/domain-facts-normalizer.ts`
  - Normalizes existing persisted status snapshot into reducer-readable `DomainFacts`.
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/deterministic-event-extractor.ts`
  - Deterministic-first extraction for structured actions, attachments, explicit human, explicit next-step.
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/journey-reducer.ts`
  - Implements `deriveFactsPatch`, `decideNextAction`, `deriveNextStage`, `buildReasonCode`, and exported `reduceJourney`.
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/next-action-resolver.ts`
  - Maps `NextAction -> AgentName | null` and `isSystemRendered`.
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/read-planner.ts`
  - Maps `NextAction` plus compact reducer context into deterministic read plans.
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/legacy-compatibility-view.ts`
  - Projects reducer truth into `projectedProposal` and `projectedDecision` for old runtime/composer consumers.

### Existing files to modify
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/types.ts`
  - Narrow role to stage constants plus compatibility exports. Remove supervisor-truth ownership from old proposal types where possible.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - Convert from proposal generator to event extractor orchestration surface.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
  - Reduce to a reducer-backed adapter shell and compatibility write surface, not a second rule engine.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
  - Replace proposal prompt with event-only prompt.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts`
  - Switch to strict schema / structured event extraction and new runtime metadata.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - Rewire turn flow to normalize facts, extract events, call reducer, resolve next action, and feed projection view into existing execution/rendering path.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/observability.ts`
  - Add node definitions and event payloads for deterministic extraction, semantic extraction, reducer, and resolver.
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/response-composer.ts`
  - Make composer consume projection-only render inputs and explicitly forbid control-plane overrides.

### Tests to add or update
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/journey-reducer.test.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/next-action-resolver.test.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.observability.test.ts`

## Chunk 1: Define New Event And Reducer Core Types

### Task 1: Add event-driven control-plane type definitions

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor-event.types.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/types.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts`

- [ ] **Step 1: Write the failing type-focused tests**

```ts
import { describe, expect, it } from 'vitest';
import type {
  DomainFacts,
  JourneyState,
  NextAction,
  SupervisorEvent,
} from '../../chatbot-v3/supervisor-event.types.js';

describe('supervisor-event.types', () => {
  it('supports reducer-native control-plane shapes', () => {
    const event: SupervisorEvent = {
      eventType: 'TRIAGE_SUBMITTED',
      confidence: 1,
      source: 'deterministic',
    };
    const state: JourneyState = { primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' };
    const action: NextAction = { type: 'GENERATE_RECOMMENDATION' };
    const facts: DomainFacts = {
      language: 'zh',
      intake: { minimalTriageStatus: 'submitted' },
      recommendation: { status: 'none', selectedHospitalIds: [] },
      process: { explained: false },
      records: { supportingDocumentsCount: 0, availableDocumentTypes: [], missingDocumentTypes: [] },
      consult: { status: 'not_started' },
      handoff: { active: false },
    };

    expect(event.eventType).toBe('TRIAGE_SUBMITTED');
    expect(state.primaryStage).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
    expect(action.type).toBe('GENERATE_RECOMMENDATION');
    expect(facts.intake.minimalTriageStatus).toBe('submitted');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
```
Expected: FAIL because the new types module does not exist yet.

- [ ] **Step 3: Add the new type definitions**

Implement `supervisor-event.types.ts` with:
- `SupervisorEventType`
- `SupervisorEvent`
- `JourneyState`
- `DomainFacts`
- `MedicalFactPatchCandidate`
- `NextAction`
- `JourneyReduction`
- `ReducerReasonCode` (string union or branded string)

Do not include `highIntentSignal` in Phase 1 metadata.

Update `types.ts` so stage constants remain canonical, but old proposal types are clearly marked as compatibility-facing where needed.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor-event.types.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/types.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/supervisor-event.types.test.ts

git commit -m "refactor(chatbot-v3): define event-driven reducer control-plane types"
```

### Task 2: Add normalized facts reader

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/domain-facts-normalizer.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeFactsFromStatusSnapshot } from '../../chatbot-v3/domain-facts-normalizer.js';

describe('normalizeFactsFromStatusSnapshot', () => {
  it('maps existing snapshot fields into normalized reducer facts', () => {
    const facts = normalizeFactsFromStatusSnapshot({
      minimalTriageStatus: 'pending',
      minimalTriageAnswersSummary: 'brain tumor, severe pain',
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['h1'],
      processExplained: true,
      supportingDocuments: [{ name: 'MRI.pdf', path: '/docs/mri.pdf' }],
    });

    expect(facts.intake.minimalTriageStatus).toBe('submitted');
    expect(facts.recommendation.status).toBe('selected');
    expect(facts.records.supportingDocumentsCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts
```
Expected: FAIL because the normalizer does not exist yet.

- [ ] **Step 3: Implement the normalizer**

Map old snapshot truth into new `DomainFacts`:
- `minimalTriageStatus/minimalTriageAnswersSummary`
- `recommendationSelectionStatus/recommendationSelectedHospitalIds`
- `processExplained`
- `supportingDocuments`
- default language/intake fields from available seed data when present

Hard rule in implementation comments and tests:
- reducer reads normalized facts only
- no mixed control-plane reads from both raw snapshot and normalized facts
- `TRIAGE_SUBMITTED` summary compaction must happen before reducer input is built, then be carried into reducer-owned normalized facts/event data

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/domain-facts-normalizer.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts

git commit -m "refactor(chatbot-v3): normalize snapshot facts for reducer"
```

## Chunk 2: Build Event Extraction Surface

### Task 3: Add deterministic event extractor

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/deterministic-event-extractor.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { extractDeterministicEvent } from '../../chatbot-v3/deterministic-event-extractor.js';

describe('extractDeterministicEvent', () => {
  it('maps TRIAGE_SUBMITTED action to deterministic event', () => {
    const event = extractDeterministicEvent({
      message: '1. brain tumor 2. six months 3. no tests',
      userAction: { type: 'TRIAGE_SUBMITTED' },
      attachments: [],
    });

    expect(event?.eventType).toBe('TRIAGE_SUBMITTED');
    expect(event?.source).toBe('deterministic');
  });

  it('maps attachments to DOCUMENTS_UPLOADED', () => {
    const event = extractDeterministicEvent({
      message: 'uploaded reports',
      attachments: [{ name: 'MRI.pdf' }],
    });

    expect(event?.eventType).toBe('DOCUMENTS_UPLOADED');
    expect(event?.metadata?.documentCount).toBe(1);
  });

  it('does not classify FAQ in the deterministic layer', () => {
    const event = extractDeterministicEvent({
      message: 'what are your prices?',
      attachments: [],
    });

    expect(event).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts
```
Expected: FAIL because the extractor does not exist yet.

- [ ] **Step 3: Implement deterministic extraction**

Support:
- `TRIAGE_SUBMITTED`
- `TRIAGE_SKIPPED`
- `RECOMMENDATION_SELECTED`
- `RECOMMENDATION_SKIPPED`
- `DOCUMENTS_UPLOADED`
- explicit human request
- explicit next-step request

Do not classify FAQ in this layer.

Deterministic precedence must be explicit in implementation and tests:
- explicit human request wins over all other deterministic matches
- structured frontend actions win over attachment-only signals
- explicit next-step wins over attachment-only signals
- attachments may not mask a higher-priority deterministic override

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/deterministic-event-extractor.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts

git commit -m "refactor(chatbot-v3): add deterministic event extraction layer"
```

### Task 4: Convert semantic supervisor to strict event schema

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildSupervisorPrompt } from './supervisor-prompt.js';

describe('buildSupervisorPrompt', () => {
  it('asks for event-only output and defines the SupervisorEvent contract', () => {
    const prompt = buildSupervisorPrompt(/* fixture */);

    expect(prompt).toContain('Return exactly one SupervisorEvent object');
    expect(prompt).toContain('Allowed eventType values');
    expect(prompt).toContain('Do not return suggestedStage, dispatchAgent, or task');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { createChatbotV3SupervisorRouteAdapter } from './supervisor-route-adapter.js';

describe('supervisor route adapter', () => {
  it('rejects non-schema event output and records schema failure metadata', async () => {
    // mock OpenAI response with invalid eventType
    // expect fallback_unknown event plus metadata
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api exec vitest run src/routes/chatbot-v3/supervisor-prompt.test.ts src/routes/chatbot-v3/supervisor-route-adapter.test.ts
```
Expected: FAIL because prompt and adapter still expect proposal output.

- [ ] **Step 3: Implement strict event extraction**

Required implementation work:
- replace proposal-shaped prompt with event-only prompt
- add strict schema / structured outputs contract
- include event metadata fields only where allowed
- pass stage-aware `allowedEventsForStage(...)` into the semantic extractor input so the LLM only chooses from the event subset that makes sense for the current workflow position
- record `source`, schema pass/fail, llm failure metadata
- return `fallback_unknown` event if semantic extraction fails
- on semantic schema failure, return `eventType=UNKNOWN_MESSAGE` with `source=\"fallback_unknown\"`
- optionally retry once with a smaller prompt/schema variant, but only if that implementation stays narrow and deterministic
- supervisor service becomes orchestrator for deterministic-first then semantic fallback
- treat `confidence` as non-authoritative in Phase 1: log it, expose it to observability, but do not let it create a second decision path

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api exec vitest run src/routes/chatbot-v3/supervisor-prompt.test.ts src/routes/chatbot-v3/supervisor-route-adapter.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-prompt.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor.service.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts

git commit -m "refactor(chatbot-v3): convert supervisor into strict event extractor"
```

## Chunk 3: Implement Reducer And Dispatch Truth

### Task 5: Implement journey reducer

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/journey-reducer.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/journey-reducer.test.ts`

- [ ] **Step 1: Write the failing reducer tests**

```ts
import { describe, expect, it } from 'vitest';
import { reduceJourney } from '../../chatbot-v3/journey-reducer.js';

describe('reduceJourney', () => {
  it('routes TRIAGE_SUBMITTED to recommendation generation', () => {
    const result = reduceJourney({
      state: { primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' },
      facts: {
        language: 'zh',
        intake: { minimalTriageStatus: 'not_started' },
        recommendation: { status: 'none', selectedHospitalIds: [] },
        process: { explained: false },
        records: { supportingDocumentsCount: 0, availableDocumentTypes: [], missingDocumentTypes: [] },
        consult: { status: 'not_started' },
        handoff: { active: false },
      },
      event: { eventType: 'TRIAGE_SUBMITTED', confidence: 1, source: 'deterministic' },
    });

    expect(result.nextAction).toEqual({ type: 'GENERATE_RECOMMENDATION' });
    expect(result.primaryStage).toBe('RECOMMENDATION');
    expect(result.factsPatch.intake?.minimalTriageStatus).toBe('submitted');
    expect(result.factsPatch.intake?.minimalTriageSummary).toBeDefined();
  });

  it('keeps primary stage stable for FAQ detours', () => {
    const result = reduceJourney({
      state: { primaryStage: 'COLLECT_MEDICAL_INPUTS' },
      facts: /* fixture */,
      event: { eventType: 'USER_ASKED_FAQ', confidence: 0.88, source: 'llm', metadata: { topic: 'pricing' } },
    });

    expect(result.primaryStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(result.nextAction).toEqual({ type: 'ANSWER_FAQ', topic: 'pricing', subtopic: undefined });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/journey-reducer.test.ts
```
Expected: FAIL because reducer does not exist yet.

- [ ] **Step 3: Implement reducer split into four steps**

Implement:
- `normalizeFacts`
- `deriveFactsPatch`
- `applyFactsPatch`
- `decideNextAction`
- `deriveNextStage`
- `buildReasonCode`
- exported `reduceJourney`

Required rule coverage:
- handoff override
- risky medical redirect
- out-of-scope redirect
- FAQ detour
- `TRIAGE_SUBMITTED`
- `TRIAGE_SKIPPED`
- `RECOMMENDATION_SELECTED`
- `RECOMMENDATION_SKIPPED`
- `DOCUMENTS_UPLOADED`
- `USER_ASKED_NEXT_STEP`
- consult interest
- ambiguous / unknown fallback

Required explicit rules:
- `TRIAGE_SUBMITTED` must patch `minimalTriageStatus=submitted` and persist normalized triage summary when available
- `TRIAGE_SKIPPED` must patch `minimalTriageStatus=skipped`
- `RECOMMENDATION_SKIPPED` remains a Phase 1 compatibility path to `SHOW_PROCESS_OVERVIEW`
- `DOCUMENTS_UPLOADED` must:
  - patch document facts first
  - go to `OFFER_ONLINE_CONSULT` if recommendation is selected and process is explained
  - go to `COLLECT_MINIMAL_TRIAGE` if minimal triage is still `not_started`
  - go to `GENERATE_RECOMMENDATION` if recommendation status is `none`
  - go to `ASK_RECOMMENDATION_SELECTION` if recommendation status is `generated`
  - otherwise go to `REQUEST_MEDICAL_DOCUMENTS`
- `USER_PROVIDED_MEDICAL_FACTS` must pass through whitelist normalization before reducer facts are updated
- `journey-runtime-authority.service.ts` must be reduced to a reducer-backed adapter shell if it remains in Phase 1; it may not continue as a second independent rule engine

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/journey-reducer.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/journey-reducer.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/journey-reducer.test.ts

git commit -m "refactor(chatbot-v3): add journey reducer as control-plane truth source"
```

### Task 6: Add next-action resolver, read planner, and projected compatibility view

**Files:**
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/next-action-resolver.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/read-planner.ts`
- Create: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/legacy-compatibility-view.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/next-action-resolver.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { resolveNextActionExecution } from '../../chatbot-v3/next-action-resolver.js';

describe('resolveNextActionExecution', () => {
  it('maps SHOW_PROCESS_OVERVIEW to system-rendered execution', () => {
    const result = resolveNextActionExecution({ type: 'SHOW_PROCESS_OVERVIEW' });

    expect(result.agent).toBeNull();
    expect(result.isSystemRendered).toBe(true);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { buildReadPlan } from '../../chatbot-v3/read-planner.js';

describe('buildReadPlan', () => {
  it('maps recommendation generation to deterministic recommendation reads', () => {
    const plan = buildReadPlan({ type: 'GENERATE_RECOMMENDATION' }, /* compact context */);

    expect(plan.domains.length).toBeGreaterThan(0);
    expect(plan.reasonCode).toBeDefined();
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { projectLegacyCompatibilityView } from '../../chatbot-v3/legacy-compatibility-view.js';

describe('projectLegacyCompatibilityView', () => {
  it('projects reducer truth without becoming a second control source', () => {
    const projected = projectLegacyCompatibilityView(/* fixture */);

    expect(projected.projectedDecision.toStage).toBe('ONLINE_CONSULT');
    expect(projected.projectedProposal.suggestedStage).toBe('ONLINE_CONSULT');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/next-action-resolver.test.ts src/services/__tests__/chatbot-v3/read-planner.test.ts src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts
```
Expected: FAIL because resolver/read-planner/projection modules do not exist yet.

- [ ] **Step 3: Implement deterministic dispatch mapping and projected view**

Required rules:
- `ANSWER_FAQ -> FaqAgent`
- `COLLECT_MINIMAL_TRIAGE / REQUEST_MEDICAL_DOCUMENTS -> RecordsAgent`
- `GENERATE_RECOMMENDATION / ASK_RECOMMENDATION_SELECTION -> RecommendationAgent`
- `OFFER_ONLINE_CONSULT -> ConsultAgent`
- `CREATE_HANDOFF -> HandoffAgent`
- `SHOW_PROCESS_OVERVIEW -> null + system-rendered`
- redirect / clarify actions stay deterministic and explicitly mapped

Read-planner requirements:
- `ANSWER_FAQ` maps to FAQ knowledge reads by `topic` and `subtopic`
- `REQUEST_MEDICAL_DOCUMENTS` maps to required-document guidance reads
- `GENERATE_RECOMMENDATION` maps to recommendation input reads
- `ASK_RECOMMENDATION_SELECTION` maps to recommendation selection context reads
- `OFFER_ONLINE_CONSULT` maps to consult config plus selected recommendation context
- `CREATE_HANDOFF` maps to lead/profile plus conversation-summary reads

Projection requirements:
- expose `projectedProposal`
- expose `projectedDecision`
- never compute a different stage than reducer truth

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/next-action-resolver.test.ts src/services/__tests__/chatbot-v3/read-planner.test.ts src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/next-action-resolver.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/read-planner.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/legacy-compatibility-view.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/next-action-resolver.test.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/read-planner.test.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts

git commit -m "refactor(chatbot-v3): resolve next actions, read plans, and compatibility projection"
```

## Chunk 4: Rewire Runtime, Authority, And Observability

### Task 7: Replace proposal-driven authority flow with reducer-driven runtime flow

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add or update tests for:
- `TRIAGE_SUBMITTED -> RECOMMENDATION`
- `RECOMMENDATION_SELECTED` conditional progression:
  - if process not explained -> reducer emits `SHOW_PROCESS_OVERVIEW`, and only that action advances the stage to `EXPLAIN_PROCESS`
  - else if docs missing -> `REQUEST_MEDICAL_DOCUMENTS`
  - else -> `OFFER_ONLINE_CONSULT`
- `RECOMMENDATION_SKIPPED -> SHOW_PROCESS_OVERVIEW`
- FAQ detour keeps primary stage stable
- document upload updates facts without invalid stage jump
- `USER_ASKED_NEXT_STEP` derives from facts, not LLM stage guess

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot-v3.routes.test.ts
```
Expected: FAIL because runtime still consumes proposal-driven supervisor truth.

- [ ] **Step 3: Rewire runtime and authority around reducer truth**

Required changes:
- normalize snapshot into `DomainFacts`
- call deterministic event extractor
- call semantic event extractor only if needed
- build single `SupervisorEvent`
- call reducer
- resolve next action execution
- build deterministic read plan from `NextAction`
- build projected compatibility view
- persist reducer truth via projected facts patch and journey stage
- when a system-rendered `SHOW_PROCESS_OVERVIEW` succeeds, write back `process.explained = true` in the runtime persistence phase, not inside the next-action resolver
- make composer read projection/render data only, never override control-plane truth

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot-v3.routes.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/runtime.service.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/response-composer.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.routes.test.ts

git commit -m "refactor(chatbot-v3): route runtime through reducer-driven control plane"
```

### Task 8: Upgrade observability and invariants

**Files:**
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/observability.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.observability.test.ts`
- Modify: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/runtime.service.ts`

- [ ] **Step 1: Write the failing observability tests**

Add assertions for node-event emission on:
- `deterministic_event_extractor`
- `semantic_event_extractor`
- `event_extraction_summary`
- `journey_reducer`
- `next_action_resolver`
- invariant mismatch logging when projection diverges from reducer truth

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot-v3.observability.test.ts
```
Expected: FAIL because these nodes and invariants do not exist yet.

- [ ] **Step 3: Implement observability and hard invariants**

Required instrumentation:
- log deterministic extraction result
- log semantic extraction result and structured schema outcome
- log final event source
- log reducer input/output summary
- log nextAction resolution
- log reducer `state_diff` including `beforeStage`, `afterStage`, and `factsPatch`
- log `side_path_summary` including `sidePath`, `sidePathType`, and `primaryStagePreserved`
- assert projection-stage equality with persisted stage and reducer stage
- compare reducer truth against the effective post-write / projected persisted snapshot, not stale pre-write storage
- assert that only `SHOW_PROCESS_OVERVIEW` can move the stage to `EXPLAIN_PROCESS`
- emit error-level logs on invariant mismatch

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api exec vitest run src/__tests__/chatbot-v3.observability.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/observability.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/runtime.service.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.observability.test.ts

git commit -m "refactor(chatbot-v3): add reducer-era observability and invariants"
```

## Chunk 5: Verification And Live Regression Gate

### Task 9: Run full local regression suite for Phase 1

**Files:**
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3/`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/*.test.ts`
- Test: `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3*.test.ts`

- [ ] **Step 1: Run focused application tests**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application exec vitest run src/services/__tests__/chatbot-v3/deterministic-event-extractor.test.ts src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts src/services/__tests__/chatbot-v3/journey-reducer.test.ts src/services/__tests__/chatbot-v3/next-action-resolver.test.ts src/services/__tests__/chatbot-v3/legacy-compatibility-view.test.ts
```
Expected: PASS.

- [ ] **Step 2: Run focused API tests**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api exec vitest run src/routes/chatbot-v3/supervisor-prompt.test.ts src/routes/chatbot-v3/supervisor-route-adapter.test.ts src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.observability.test.ts
```
Expected: PASS.

- [ ] **Step 3: Run typecheck if needed by touched modules**

Run:
```bash
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/packages/application typecheck
pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/apps/api typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit any final test-fix deltas**

```bash
git add /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3 \
  /Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/__tests__/chatbot-v3 \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3 \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  /Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/__tests__/chatbot-v3.observability.test.ts

git commit -m "test(chatbot-v3): verify phase-1 event-driven reducer migration"
```

### Task 10: Run live regression matrix before merge

**Files:**
- Use: `/Users/haowang/Desktop/claws/medical-crm-v2/scripts/chatbot-v3-real-api-dogfood.ts`
- Use: `/Users/haowang/Desktop/claws/medical-crm-v2/artifacts/chatbot-v3-live-sessions/`
- Reference: `/Users/haowang/Desktop/claws/medical-crm-v2/docs/analysis/2026-04-24-chatbot-v3-live-session-testing-guide.md`

- [ ] **Step 1: Deploy branch safely to live test environment**

Run the established deployment workflow from the current branch or from `origin` after push, then confirm:
```bash
curl -fsS https://crmapi.medicaltourismchina.health/health
```
Expected: `{"status":"ok",...}`

- [ ] **Step 2: Run targeted live scenarios**

Required live scenarios:
- early treatment intent
- triage submit
- triage skip
- recommendation select
- recommendation skip
- explain-process FAQ detour
- upload docs before recommendation
- upload docs after recommendation
- consult interest without docs
- consult interest with docs
- human request
- risky medical advice
- out-of-scope request

Expected: no control-plane drift, no FAQ stage pollution, and logs show `event -> reducer -> nextAction -> dispatch` clearly.

- [ ] **Step 3: Inspect production logs for reducer-era signals**

Using the existing Lightsail workflow, confirm logs contain:
- `deterministic_event_extractor`
- `semantic_event_extractor`
- `event_extraction_summary`
- `journey_reducer`
- `next_action_resolver`

Expected: no invariant mismatch errors in passing scenarios.

- [ ] **Step 4: Summarize findings and prepare merge/deploy decision**

Document:
- passed flows
- degraded flows
- any invariant mismatches
- whether projection still hides any old-surface drift

No merge until the targeted matrix is acceptable.
