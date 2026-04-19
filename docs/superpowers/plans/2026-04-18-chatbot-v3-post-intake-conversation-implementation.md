# Chatbot V3 Post-Intake Conversation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `chatbot-v3` with the post-intake product flow so the first assistant turn acknowledges completed intake, the user can answer or skip the 3 follow-up triage questions, recommendation still runs either way, hospital choice becomes structured truth with v1 single-select normalization, and process explanation follows recommendation or explicit hospital skip.

**Architecture:** Keep the existing supervisor-led control plane and canonical journey order, but widen the persisted/session contract from boolean-only truth flags to authority-owned structured status fields plus compatibility aliases. Runtime should interpret structured user actions, `JourneyRuntimeAuthority` should atomically approve/write structured + boolean truth, and prompt/composer layers should render the new post-intake semantics without reintroducing dual truths. The authority/supervisor gate for `EXPLAIN_PROCESS` must key off the structured recommendation-selection status so either `selected` or `skipped` can advance after recommendation is presented. `recommendationSelectedHospitalIds` must normalize to `[]` or exactly one id at runtime, repository, and serialization boundaries.

**Tech Stack:** TypeScript, Hono, Vitest, Zod, Drizzle ORM, supervisor-led `chatbot-v3` runtime.

---

## File Map

### Existing files to modify
- `packages/domain/src/entities/ai-chat-session.entity.ts`
  - Extend `AiChatStatusSnapshot` with post-intake structured fields, legacy hydration, `serializeStatusSnapshot()`, and compatibility derivations.
- `packages/domain/__tests__/ai-chat-session.entity.test.ts`
  - Lock structured-field defaults, legacy hydration, `serializeStatusSnapshot()` output, compatibility aliases, and no-dual-truth behavior.
- `packages/infrastructure/database/schema/schema.ts`
  - Add persisted columns for the new session snapshot fields.
- `packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`
  - Read/write the new structured status fields through `save`, `rowToEntity`, and `patchStatus`.
- `packages/application/src/services/chatbot-v3/types.ts`
  - Extend runtime/authority types so writes can carry structured status patches plus compatibility boolean aliases.
- `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
  - Add post-intake opening, triage answered/skipped, recommendation presented/selected/skipped, and process-follow-up authority rules.
- `packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - Update fallback heuristics and necessary-facts selection to use the richer post-intake contract.
- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - Lock the updated `EXPLAIN_PROCESS` gate so skipped hospital choice can still advance to process explanation.
- `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
  - Cover authority-owned writes and stage gating for the new flow.
- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - Lock supervisor fallbacks around intake acknowledgement, triage skip, and recommendation selection.
- `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
  - Extend request schema with structured action payloads and response card actions for skip/select flows.
- `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`
  - Cover new request/response schema branches.
- `apps/api/src/routes/chatbot-v3/worker-task.ts`
  - Add typed worker/runtime action signals and richer records/recommendation task inputs.
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - Normalize structured user actions, derive richer facts, produce authority-owned structured write intents, and default answered/skipped triage into recommendation.
- `apps/api/src/routes/chatbot-v3.routes.ts`
  - Accept structured action payloads, feed them into runtime, and persist authority-approved structured + compatibility patches atomically.
- `apps/api/src/routes/chatbot-v3/records-prompts.ts`
  - Reframe minimal triage as post-intake follow-up, not cold-start intake.
- `apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
  - Frame recommendation generation differently for `answered` versus `skipped` triage.
- `apps/api/src/routes/chatbot-v3/response-composer.ts`
  - Render the new opening/recommendation/process language, keep hospital selection on card actions, and treat hospital skip as a structured request action payload instead of a card-owned truth write.
- `apps/api/src/routes/chatbot-v3/records-route-adapter.ts`
  - Preserve records worker outputs for `answered` versus `skipped` triage completion.
- `apps/api/src/routes/chatbot-v3/recommendation-route-adapter.ts`
  - Preserve recommendation selection context and hospital-choice actions.
- `apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
  - Lock post-intake records prompt behavior at the LLM adapter seam.
- `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`
  - Lock answered-vs-skipped recommendation prompt behavior at the LLM adapter seam.
- `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
  - Lock new user-facing copy, action wiring, and answered/skipped recommendation wording.
- `apps/api/src/routes/chatbot-v3/records-route-adapter.test.ts`
  - Cover triage answered/skipped normalization.
- `apps/api/src/routes/chatbot-v3/recommendation-route-adapter.test.ts`
  - Cover selection/skip action normalization.
- `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
  - Cover route schema/action plumbing, malformed actions, serialized status snapshot fields, and persistence writes.
- `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
  - Add end-to-end session regressions for post-intake opening, skip-to-recommendation, select/skip hospital, serialized status snapshot fields, and process explanation continuity.

### New files to create
- `packages/infrastructure/database/migrations/035_ai_chat_post_intake_conversation.sql`
  - Add nullable persisted columns for structured post-intake chatbot fields and any required legacy backfill helpers.

## Chunk 1: Structured Persistence And Authority Write Contract

### Task 1: Persist post-intake structured fields in the session snapshot

**Files:**
- Create: `packages/infrastructure/database/migrations/035_ai_chat_post_intake_conversation.sql`
- Modify: `packages/domain/src/entities/ai-chat-session.entity.ts`
- Modify: `packages/domain/__tests__/ai-chat-session.entity.test.ts`
- Create: `packages/infrastructure/database/repositories/__tests__/drizzle-ai-chat-session.repository.test.ts`
- Modify: `packages/infrastructure/database/schema/schema.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`

- [ ] **Step 1: Write the failing domain/repository tests**

```ts
it('defaults post-intake structured chatbot fields without inventing completed truth', () => {
  const session = new AiChatSession({
    // ...existing fixture props
    statusSnapshot: {},
  });

  expect(session.statusSnapshot.intakeAcknowledged).toBe(false);
  expect(session.statusSnapshot.minimalTriageStatus).toBe('pending');
  expect(session.statusSnapshot.minimalTriageAnswersSummary).toBeNull();
  expect(session.statusSnapshot.recommendationPresented).toBe(false);
  expect(session.statusSnapshot.recommendationSelectionStatus).toBe('pending');
  expect(session.statusSnapshot.recommendationSelectedHospitalIds).toEqual([]);
});

it('derives compatibility booleans from richer post-intake fields without divergence', () => {
  const flags = deriveCanonicalTruthFlagsFromStatusSnapshot({
    minimalTriageStatus: 'skipped',
    recommendationSelectionStatus: 'selected',
    recommendationSelectedHospitalIds: ['hospital-1'],
  });

  expect(flags['records.minimal_triage.complete']).toBe(true);
  expect(flags['recommendation.selected']).toBe(true);
});

it('serializes the structured post-intake snapshot end-to-end', () => {
  const session = new AiChatSession({
    // ...existing fixture props
    statusSnapshot: {
      intakeAcknowledged: true,
      minimalTriageStatus: 'answered',
      minimalTriageAnswersSummary: 'Breast lump for two months; ultrasound already done.',
      recommendationPresented: true,
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      minimalTriageComplete: true,
      recommendationSelected: true,
    },
  });

  expect(session.serializeStatusSnapshot()).toMatchObject({
    intakeAcknowledged: true,
    minimalTriageStatus: 'answered',
    minimalTriageAnswersSummary: 'Breast lump for two months; ultrasound already done.',
    recommendationPresented: true,
    recommendationSelectionStatus: 'selected',
    recommendationSelectedHospitalIds: ['hospital-1'],
    minimalTriageComplete: true,
    recommendationSelected: true,
  });
});

it('normalizes recommendationSelectedHospitalIds to a single canonical id at construction and serialization', () => {
  const session = new AiChatSession({
    // ...existing fixture props
    statusSnapshot: {
      recommendationSelectedHospitalIds: ['hospital-1', 'hospital-2'],
    },
  });

  expect(session.statusSnapshot.recommendationSelectedHospitalIds).toEqual(['hospital-1']);
  expect(session.serializeStatusSnapshot().recommendationSelectedHospitalIds).toEqual(['hospital-1']);
});

it('hydrates a legacy boolean-only row into structured truth instead of regressing to pending/false', async () => {
  const legacyRow = {
    // ...existing row columns
    minimal_triage_complete: true,
    recommendation_selected: true,
    minimal_triage_status: null,
    recommendation_selection_status: null,
    recommendation_selected_hospital_ids: null,
  };

  const entity = repository.rowToEntity(legacyRow as never);

  expect(entity.statusSnapshot.minimalTriageStatus).not.toBe('pending');
  expect(entity.statusSnapshot.minimalTriageComplete).toBe(true);
  expect(entity.statusSnapshot.recommendationSelectionStatus).toBe('selected');
  expect(entity.statusSnapshot.recommendationSelected).toBe(true);
});

it('round-trips structured recommendation selection fields and compatibility aliases through persistence', async () => {
  const saved = await repository.save(new AiChatSession({
    // ...existing fixture props
    statusSnapshot: {
      intakeAcknowledged: true,
      recommendationPresented: true,
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      recommendationSelected: true,
    },
  }));

  const patched = await repository.patchStatus(saved.sessionId, saved.site, {
    recommendationSelectionStatus: 'skipped',
    recommendationSelectedHospitalIds: [],
    recommendationSelected: false,
  });

  expect(patched?.statusSnapshot.intakeAcknowledged).toBe(true);
  expect(patched?.statusSnapshot.recommendationSelectionStatus).toBe('skipped');
  expect(patched?.statusSnapshot.recommendationSelectedHospitalIds).toEqual([]);
  expect(deriveCanonicalTruthFlagsFromStatusSnapshot(patched?.statusSnapshot)['recommendation.selected']).toBe(false);
});

it('clamps multi-id recommendation selections to a single canonical id during persistence', async () => {
  const patched = await repository.patchStatus('session-1', 'beauty', {
    recommendationSelectionStatus: 'selected',
    recommendationSelectedHospitalIds: ['hospital-1', 'hospital-2'],
    recommendationSelected: true,
  });

  expect(patched?.statusSnapshot.recommendationSelectedHospitalIds).toEqual(['hospital-1']);
  expect(patched?.serializeStatusSnapshot().recommendationSelectedHospitalIds).toEqual(['hospital-1']);
});

it('persists post-intake structured fields through repository save and patchStatus', async () => {
  const entity = new AiChatSession({
    // ...existing fixture props
    statusSnapshot: {
      intakeAcknowledged: true,
      minimalTriageStatus: 'answered',
      minimalTriageAnswersSummary: 'Breast lump for two months; ultrasound already done.',
      recommendationPresented: true,
      recommendationSelectionStatus: 'pending',
      recommendationSelectedHospitalIds: [],
      minimalTriageComplete: true,
      recommendationSelected: false,
    },
  });

  await repository.save(entity);
  const patched = await repository.patchStatus(entity.sessionId, entity.site, {
    recommendationSelectionStatus: 'selected',
    recommendationSelectedHospitalIds: ['hospital-1'],
    recommendationSelected: true,
  });

  expect(patched?.statusSnapshot.intakeAcknowledged).toBe(true);
  expect(patched?.statusSnapshot.minimalTriageStatus).toBe('answered');
  expect(patched?.statusSnapshot.minimalTriageComplete).toBe(true);
  expect(patched?.statusSnapshot.recommendationSelectionStatus).toBe('selected');
  expect(patched?.statusSnapshot.recommendationSelectedHospitalIds).toEqual(['hospital-1']);
  expect(patched?.statusSnapshot.recommendationSelected).toBe(true);
});

it('normalizes contradictory structured truth and compatibility aliases instead of persisting drift', async () => {
  const patched = await repository.patchStatus('session-1', 'beauty', {
    minimalTriageStatus: 'pending',
    minimalTriageComplete: true,
    recommendationSelectionStatus: 'skipped',
    recommendationSelectedHospitalIds: [],
    recommendationSelected: true,
  });

  expect(patched?.statusSnapshot.minimalTriageStatus).toBe('pending');
  expect(patched?.statusSnapshot.minimalTriageComplete).toBe(false);
  expect(patched?.statusSnapshot.recommendationSelectionStatus).toBe('skipped');
  expect(patched?.statusSnapshot.recommendationSelected).toBe(false);
});

it('keeps minimalTriageComplete true when persisted triage status is skipped', async () => {
  const patched = await repository.patchStatus('session-1', 'beauty', {
    minimalTriageStatus: 'skipped',
    minimalTriageComplete: true,
  });

  expect(patched?.statusSnapshot.minimalTriageStatus).toBe('skipped');
  expect(patched?.statusSnapshot.minimalTriageComplete).toBe(true);
  expect(deriveCanonicalTruthFlagsFromStatusSnapshot(patched?.statusSnapshot)['records.minimal_triage.complete']).toBe(true);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
Expected: FAIL because the new fields/derivations do not exist yet.

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/infrastructure test -- packages/infrastructure/database/repositories/__tests__/drizzle-ai-chat-session.repository.test.ts`
Expected: FAIL because repository round-trip coverage for the new structured fields does not exist yet.

- [ ] **Step 3: Add persisted session fields and repository plumbing**

```ts
export interface AiChatStatusSnapshot {
  // existing fields...
  intakeAcknowledged: boolean;
  minimalTriageStatus: 'pending' | 'answered' | 'skipped';
  minimalTriageAnswersSummary: string | null;
  recommendationPresented: boolean;
  recommendationSelectionStatus: 'pending' | 'selected' | 'skipped';
  recommendationSelectedHospitalIds: string[];
  minimalTriageComplete: boolean | null; // rollout compatibility alias
  recommendationSelected: boolean | null; // rollout compatibility alias
}
```

Implementation notes:
- Keep the new fields nullable in SQL for rollout safety, but normalize them to concrete defaults in the entity constructor.
- Add read-time hydration in `rowToEntity` so legacy rows that only carry `minimalTriageComplete` or `recommendationSelected` still hydrate into structured `answered`/`selected` truth instead of defaulting to `pending`/`false`.
- If the migration can safely backfill existing rows, do that too, but treat hydration as the compatibility floor rather than the only protection.
- Extend repository `save`, `rowToEntity`, and `patchStatus` so these fields survive round-trip persistence.
- Keep `minimalTriageComplete` and `recommendationSelected` as persisted rollout compatibility aliases, but derive them from the structured fields whenever explicit booleans are absent.
- Explicitly clear `minimalTriageComplete` when the structured triage status is `pending`, and derive it as `status !== 'pending'` so `answered` and `skipped` both stay true. Keep `recommendationSelected` false when the structured recommendation status is `pending` or `skipped`.
- Normalize `recommendationSelectedHospitalIds` to `[]` or a single canonical id at every entity, repository, and serialization boundary; if a legacy row or buggy patch provides multiple ids, clamp to the first non-empty id instead of serializing multi-select state.
- Add a regression that proves `serializeStatusSnapshot()` and repository round-trips never emit more than one selected hospital id, even when the input payload is malformed or legacy data is denormalized.
- The repository test must be the seam that proves `save`, `rowToEntity`, and `patchStatus` cannot persist structured status and compatibility aliases in contradictory states.
- If `patchStatus` receives contradictory structured truth and compatibility aliases, normalize to the structured field before persistence rather than silently storing drift.

- [ ] **Step 4: Add the migration and schema updates**

```sql
ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS intake_acknowledged BOOLEAN,
  ADD COLUMN IF NOT EXISTS minimal_triage_status TEXT,
  ADD COLUMN IF NOT EXISTS minimal_triage_answers_summary TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_presented BOOLEAN,
  ADD COLUMN IF NOT EXISTS recommendation_selection_status TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_selected_hospital_ids JSONB;
```

If the legacy boolean-only rows can be safely backfilled during deploy, add that update to this migration too; otherwise, make `rowToEntity` the compatibility floor and keep the backfill note in the implementation comments.

- [ ] **Step 5: Run verification for domain + infrastructure**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/infrastructure test -- packages/infrastructure/database/repositories/__tests__/drizzle-ai-chat-session.repository.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain typecheck`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/infrastructure typecheck`
Expected: PASS.

- [ ] **Step 6: Commit the persistence slice**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  packages/domain/src/entities/ai-chat-session.entity.ts \
  packages/domain/__tests__/ai-chat-session.entity.test.ts \
  packages/infrastructure/database/repositories/__tests__/drizzle-ai-chat-session.repository.test.ts \
  packages/infrastructure/database/schema/schema.ts \
  packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts \
  packages/infrastructure/database/migrations/035_ai_chat_post_intake_conversation.sql
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): persist post-intake conversation fields"
```

### Task 2: Expand authority write contract from boolean-only facts to structured + compatibility writes

**Files:**
- Modify: `packages/application/src/services/chatbot-v3/types.ts`
- Modify: `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`

- [ ] **Step 1: Write the failing authority tests**

```ts
it('writes intake acknowledgement and keeps minimal triage pending on the post-intake opening turn', () => {
  const decision = service.decide({
    current: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
    proposal: { intent: 'progression', suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS', reason: 'open post-intake follow-up' },
    facts: { 'intake.received': true },
  });

  expect(decision.write.structuredStatusPatch.intake?.acknowledged).toBe(true);
  expect(decision.write.structuredStatusPatch.records?.minimal_triage?.status).toBe('pending');
  expect(decision.write.factsPatch['records.minimal_triage.complete']).toBeUndefined();
});

it('writes answered triage as complete and advances recommendation eligibility', () => {
  const decision = service.decide({
    current: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
    proposal: { intent: 'progression', suggestedStage: 'RECOMMENDATION', reason: 'triage answered' },
    facts: {
      'intake.received': true,
      'records.minimal_triage.status': 'answered',
    },
  });

  expect(decision.write.structuredStatusPatch.records?.minimal_triage?.status).toBe('answered');
  expect(decision.write.factsPatch['records.minimal_triage.complete']).toBe(true);
});

it('writes skipped triage as complete and keeps the compatibility alias true', () => {
  const decision = service.decide({
    current: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
    proposal: { intent: 'progression', suggestedStage: 'RECOMMENDATION', reason: 'triage skipped' },
    facts: {
      'intake.received': true,
      'records.minimal_triage.status': 'skipped',
    },
  });

  expect(decision.write.structuredStatusPatch.records?.minimal_triage?.status).toBe('skipped');
  expect(decision.write.factsPatch['records.minimal_triage.complete']).toBe(true);
});

it('writes recommendation selection structure and compatibility alias atomically', () => {
  const decision = service.decide({
    current: { stage: 'RECOMMENDATION', phase: 'active' },
    proposal: { intent: 'progression', suggestedStage: 'EXPLAIN_PROCESS', reason: 'hospital selected after recommendation' },
    facts: {
      'recommendation.presented': true,
      'recommendation.selection.status': 'selected',
    },
    recommendationSelection: {
      selectedHospitalIds: ['hospital-1'],
    },
  });

  expect(decision.write.structuredStatusPatch.recommendation?.presented).toBe(true);
  expect(decision.write.structuredStatusPatch.recommendation?.selection?.status).toBe('selected');
  expect(decision.write.structuredStatusPatch.recommendation?.selection?.selectedHospitalIds).toEqual(['hospital-1']);
  expect(decision.write.factsPatch['recommendation.selected']).toBe(true);
});

it('writes recommendation skipped state and keeps recommendation.selected false while recommendation.presented stays true', () => {
  const decision = service.decide({
    current: { stage: 'RECOMMENDATION', phase: 'active' },
    proposal: { intent: 'progression', suggestedStage: 'EXPLAIN_PROCESS', reason: 'user skipped hospital selection after recommendation' },
    facts: {
      'recommendation.presented': true,
      'recommendation.selection.status': 'skipped',
    },
  });

  expect(decision.write.structuredStatusPatch.recommendation?.presented).toBe(true);
  expect(decision.write.structuredStatusPatch.recommendation?.selection?.status).toBe('skipped');
  expect(decision.write.structuredStatusPatch.recommendation?.selection?.selectedHospitalIds).toEqual([]);
  expect(decision.write.factsPatch['recommendation.selected']).toBe(false);
});

it('allows skipped hospital selection to advance to EXPLAIN_PROCESS once recommendation is presented', () => {
  const decision = service.decide({
    current: { stage: 'RECOMMENDATION', phase: 'active' },
    proposal: { intent: 'progression', suggestedStage: 'EXPLAIN_PROCESS', reason: 'skip still opens process explanation' },
    facts: {
      'recommendation.presented': true,
      'recommendation.selection.status': 'skipped',
    },
  });

  expect(decision.write.stage).toBe('EXPLAIN_PROCESS');
  expect(decision.write.structuredStatusPatch.recommendation?.selection?.status).toBe('skipped');
  expect(decision.write.factsPatch['recommendation.selected']).toBe(false);
});
```

- [ ] **Step 2: Run the focused authority tests to verify they fail**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
Expected: FAIL because the write contract is still boolean-only.

- [ ] **Step 3: Extend the authority types and implementation**

```ts
export interface JourneyRuntimeAuthorityStructuredStatusPatch {
  intake?: { acknowledged?: boolean };
  records?: {
    minimal_triage?: {
      status?: 'pending' | 'answered' | 'skipped';
      answersSummary?: string | null;
    };
  };
  recommendation?: {
    presented?: boolean;
    selection?: {
      status?: 'pending' | 'selected' | 'skipped';
      selectedHospitalIds?: string[];
    };
  };
}

export interface JourneyRuntimeAuthorityWrite {
  authority: 'journey-runtime-authority';
  stage: ChatbotV3StageRef;
  structuredStatusPatch: JourneyRuntimeAuthorityStructuredStatusPatch;
  factsPatch: Partial<Record<string, boolean>>;
}

export interface JourneyRuntimeAuthorityRecommendationSelectionInput {
  selectedHospitalIds: string[];
}
```

Implementation notes:
- `JourneyRuntimeAuthorityService` must emit structured fields and compatibility aliases together in one write.
- Keep `process.explained` in `factsPatch`, but emit selection/triage structure through `structuredStatusPatch`.
- Treat `records.minimal_triage.status !== 'pending'` as completion, not just answered; that means both `answered` and `skipped` must keep `records.minimal_triage.complete=true`.
- In every authority test that verifies `records.minimal_triage.status` or `recommendation.selection.status`, assert the matching compatibility alias in the same expectation block so canonical structure and aliases cannot drift silently.
- The authority layer must not invent selected hospital ids; it should preserve the normalized selection ids that runtime passes in from the user action signal.
- Clamp `recommendationSelection.selectedHospitalIds` to a single canonical id before emitting the structured write, so even a buggy runtime handoff cannot reintroduce a multi-select payload.
- If the current `JourneyRuntimeAuthorityInput` shape cannot carry normalized hospital-selection ids yet, extend it with an explicit typed field such as `recommendationSelection.selectedHospitalIds` rather than encoding ids inside ad hoc fact keys.
- `packages/application/src/services/chatbot-v3/types.ts` is the canonical home for this new `recommendationSelection` input shape; runtime and authority tests should reference that exported type instead of inventing local ad hoc objects.
- The policy/authority gate for `EXPLAIN_PROCESS` must advance after `recommendation.selection.status='selected'` or `recommendation.selection.status='skipped'` once recommendation is presented; do not require the legacy `recommendation.selected=true` alias as the only gate.

- [ ] **Step 4: Verify the authority slice**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application typecheck`
Expected: PASS.

- [ ] **Step 5: Commit the authority contract slice**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  packages/application/src/services/chatbot-v3/types.ts \
  packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): add authority-owned post-intake writes"
```

## Chunk 2: Runtime Action Signals And Journey Progression

### Task 3: Accept structured user actions in the public request and normalize them into runtime signals

**Files:**
- Modify: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- Modify: `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/worker-task.ts`
- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write failing schema/route tests for action payloads**

```ts
it('accepts TRIAGE_SKIPPED action payloads without freeform message text', () => {
  const parsed = chatbotV3ChatRequestSchema.parse({
    sessionId: 'session-1',
    message: '',
    action: { type: 'TRIAGE_SKIPPED' },
  });

  expect(parsed.action?.type).toBe('TRIAGE_SKIPPED');
});

it('persists authority-approved selection writes from RECOMMENDATION_SELECTED actions', async () => {
  const response = await app.request('/api/v3/chatbot/chat', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: 'session-1',
      message: '',
      action: { type: 'RECOMMENDATION_SELECTED', hospitalId: 'hospital-1' },
    }),
  });

  expect(response.body.statusSnapshot).toMatchObject({
    recommendationSelectionStatus: 'selected',
    recommendationSelectedHospitalIds: ['hospital-1'],
    recommendationSelected: true,
  });

  expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
    'session-1',
    'beauty',
    expect.objectContaining({
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      recommendationSelected: true,
    }),
  );
});

it('rejects recommendation selection requests with a missing or blank hospitalId', () => {
  expect(() =>
    chatbotV3ChatRequestSchema.parse({
      sessionId: 'session-1',
      message: '',
      action: { type: 'RECOMMENDATION_SELECTED' },
    }),
  ).toThrow();

  expect(() =>
    chatbotV3ChatRequestSchema.parse({
      sessionId: 'session-1',
      message: '',
      action: { type: 'RECOMMENDATION_SELECTED', hospitalId: '' },
    }),
  ).toThrow();

  expect(() =>
    chatbotV3ChatRequestSchema.parse({
      sessionId: 'session-1',
      message: '',
      action: { type: 'RECOMMENDATION_SELECTED', hospitalId: ['hospital-1', 'hospital-2'] as never },
    }),
  ).toThrow();
});

it('rejects recommendation selection before the recommendation has actually been presented', async () => {
  const response = await app.request('/api/v3/chatbot/chat', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: 'session-1',
      message: '',
      action: { type: 'RECOMMENDATION_SELECTED', hospitalId: 'hospital-1' },
    }),
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: {
      code: 'INVALID_ACTION_STATE',
    },
  });
  expect(mockServices.aiChatSessionRepo.patchStatus).not.toHaveBeenCalled();
});

it('persists the explicit RECOMMENDATION_SKIPPED action through the same structured route path', async () => {
  const response = await app.request('/api/v3/chatbot/chat', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: 'session-1',
      message: '',
      action: { type: 'RECOMMENDATION_SKIPPED' },
    }),
  });

  expect(response.body.statusSnapshot).toMatchObject({
    recommendationSelectionStatus: 'skipped',
    recommendationSelected: false,
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts`
Expected: FAIL because request/action schema and route plumbing do not exist yet.

- [ ] **Step 3: Add typed action schema and runtime normalization**

```ts
action:
  | { type: 'TRIAGE_ANSWERED' }
  | { type: 'TRIAGE_SKIPPED' }
  | { type: 'RECOMMENDATION_SELECTED'; hospitalId: string }
  | { type: 'RECOMMENDATION_SKIPPED' }
```

Implementation notes:
- Keep `message` optional only when `action` is present.
- Enforce single-select at the schema boundary by requiring exactly one non-empty `hospitalId` for `RECOMMENDATION_SELECTED` and rejecting any missing, blank, or multi-selection payload shape before it reaches runtime.
- Runtime should return a concrete `409 INVALID_ACTION_STATE` error if `RECOMMENDATION_SELECTED` arrives before `recommendationPresented=true`; do not silently no-op.
- Extend `WorkerTask`/runtime input types with a structured user action field.
- Route should pass the action to runtime instead of smuggling it through raw prompt text.
- Treat hospital skip as a structured request action payload (`RECOMMENDATION_SKIPPED`), not as a card-owned truth mutation.

- [ ] **Step 4: Verify schema + route plumbing**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the action-schema slice**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  packages/shared/validation/src/chatbot-v3/chat.schema.ts \
  packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts \
  apps/api/src/routes/chatbot-v3/worker-task.ts \
  apps/api/src/routes/chatbot-v3.routes.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): add structured post-intake user actions"
```

### Task 4: Teach runtime and supervisor how post-intake progression actually advances

**Files:**
- Modify: `packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`

- [ ] **Step 1: Write failing progression tests**

```ts
it('opens with intake acknowledgement before repeating the triage questions', async () => {
  const response = await driver.send({ message: 'Hello' });
  expect(response.body.messages[0]?.text).toContain('we have received your basic information');
  expect(response.body.journey.stage).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
  expect(response.body.statusSnapshot).toMatchObject({
    intakeAcknowledged: true,
    minimalTriageStatus: 'pending',
    recommendationSelectionStatus: 'pending',
  });
  expect(getPersistedSession().statusSnapshot.intakeAcknowledged).toBe(true);
  expect(getPersistedSession().statusSnapshot.minimalTriageStatus).toBe('pending');
});

it('does not reopen the post-intake acknowledgement once intakeAcknowledged is already persisted', async () => {
  await seedSession({ intakeAcknowledged: true, minimalTriageStatus: 'pending' });

  const response = await driver.send({ message: 'Hello again' });

  expect(response.body.messages[0]?.text).not.toContain('we have received your basic information');
  expect(getPersistedSession().statusSnapshot.intakeAcknowledged).toBe(true);
});

it('advances to recommendation after TRIAGE_SKIPPED instead of blocking on answered-only completion', async () => {
  const response = await driver.send({
    message: '',
    action: { type: 'TRIAGE_SKIPPED' },
  });
  expect(response.body.journey.stage).toBe('RECOMMENDATION');
  expect(response.body.statusSnapshot.minimalTriageStatus).toBe('skipped');
  expect(response.body.statusSnapshot.minimalTriageComplete).toBe(true);
});

it('advances to recommendation after TRIAGE_ANSWERED once follow-up answers are captured', async () => {
  const response = await driver.send({
    message: 'The diagnosis is breast lump, for two months, moderate pain, ultrasound already done.',
    action: { type: 'TRIAGE_ANSWERED' },
  });
  expect(response.body.journey.stage).toBe('RECOMMENDATION');
  expect(getPersistedSession().statusSnapshot.minimalTriageStatus).toBe('answered');
  expect(getPersistedSession().statusSnapshot.minimalTriageAnswersSummary).toContain('breast lump');
  expect(response.body.statusSnapshot.minimalTriageStatus).toBe('answered');
  expect(response.body.statusSnapshot.minimalTriageComplete).toBe(true);
});

it('allows EXPLAIN_PROCESS after RECOMMENDATION_SKIPPED at the policy/authority gate', () => {
  const decision = authority.decide({
    current: { stage: 'RECOMMENDATION', phase: 'active' },
    proposal: { intent: 'progression', suggestedStage: 'EXPLAIN_PROCESS', reason: 'user skipped hospital selection' },
    facts: {
      'recommendation.presented': true,
      'recommendation.selection.status': 'skipped',
      'recommendation.selected': false,
    },
  });

  expect(decision.outcome).toBe('ALLOW');
  expect(decision.to.stage).toBe('EXPLAIN_PROCESS');
});
```

- [ ] **Step 2: Run the focused runtime/session tests to verify they fail**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.mounting.test.ts`
Expected: FAIL because runtime still assumes cold-start minimal triage and answered-only progression.

- [ ] **Step 3: Implement post-intake progression and atomic persistence**

```ts
const nextStage = triageStatus === 'answered' || triageStatus === 'skipped'
  ? 'RECOMMENDATION'
  : 'COLLECT_MINIMAL_MEDICAL_FACTS';
```

Implementation notes:
- `SupervisorService` should prefer a post-intake opening when `intake.received=true` and `intake.acknowledged!=true`.
- Runtime should merge `structuredStatusPatch` and `factsPatch` into one persisted `patchStatus` call.
- `resolveFacts(...)` should expose both structured status facts and compatibility boolean aliases to the supervisor/authority.
- `recommendation.selection.status='selected'` should set `recommendation.selected=true`; `skipped` should set it `false`.
- The `EXPLAIN_PROCESS` transition must key off the structured recommendation selection status, so a presented recommendation with `skipped` still advances the journey instead of being blocked by the legacy `recommendation.selected=true` alias alone.
- Update the policy/config layer and its tests so the `EXPLAIN_PROCESS` prerequisite accepts either `recommendation.selection.status='selected'` or `recommendation.selection.status='skipped'` once `recommendation.presented=true`.
- `serializeStatusSnapshot()` must surface the structured fields and aliases end-to-end so route and mounting tests can assert the same shape the client receives.

- [ ] **Step 4: Verify progression and persistence**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.mounting.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit the runtime progression slice**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts \
  packages/application/src/services/chatbot-v3/supervisor.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/routes/chatbot-v3.routes.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): align runtime with post-intake progression"
```

## Chunk 3: Prompt, Composer, And Session Experience

### Task 5: Reframe records/recommendation prompts and assistant copy around post-intake semantics

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/records-prompts.ts`
- Modify: `apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
- Modify: `apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/records-route-adapter.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/recommendation-route-adapter.test.ts`

- [ ] **Step 1: Write the failing prompt/composer tests**

```ts
it('renders a post-intake opening instead of cold-start intake wording', () => {
  expect(buildAssistantText(result)).toContain('welcome to Medora Health');
  expect(buildAssistantText(result)).toContain('we have received your basic information');
});

it('frames skipped-triage recommendation as intake-based and still actionable', () => {
  expect(buildAssistantText(result)).toContain('based on the basic information you already submitted');
  expect(buildAssistantText(result)).toContain('we can further refine this recommendation');
});

it('frames answered-triage recommendation as based on intake plus follow-up answers', () => {
  expect(buildAssistantText(answeredTriageResult)).toContain('based on the basic information you submitted and the answers you just provided');
});

it('renders distinct process explanation copy after selected versus skipped hospital choice', () => {
  expect(buildAssistantText(selectedResult)).toContain('you have selected a hospital');
  expect(buildAssistantText(selectedResult)).toContain('medical tourism process');
  expect(buildAssistantText(skippedSelectionResult)).toContain('you have not selected a hospital yet');
  expect(buildAssistantText(skippedSelectionResult)).toContain('medical tourism process');
});

it('locks the records LLM adapter to the post-intake branch semantics', async () => {
  await expect(recordsLlmAdapter.runStatus({ task: answeredRecordsTask })).resolves.toMatchObject({
    'records.minimal_triage.complete': true,
  });
  await expect(recordsLlmAdapter.runStatus({ task: skippedRecordsTask })).resolves.toMatchObject({
    'records.minimal_triage.complete': true,
  });
});

it('locks the recommendation LLM adapter to the answered-versus-skipped prompt branches', async () => {
  await expect(recommendationLlmAdapter.runGenerate({
    task: answeredRecommendationTask,
    recommendations,
  })).resolves.toMatchObject({ recommendations: expect.any(Array) });
  await expect(recommendationLlmAdapter.runGenerate({
    task: skippedRecommendationTask,
    recommendations,
  })).resolves.toMatchObject({ recommendations: expect.any(Array) });
});

it('keeps hospital skip outside the recommendation card action contract', () => {
  expect(recommendationListCard.actions.some((action) => /skip/i.test(action.label))).toBe(false);
});
```

- [ ] **Step 2: Run the focused prompt/composer tests to verify they fail**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/records-route-adapter.test.ts src/routes/chatbot-v3/recommendation-route-adapter.test.ts`
Expected: FAIL because current copy still sounds like cold-start intake.

- [ ] **Step 3: Update prompts and composer copy**

```ts
export function buildRecordsMinimalTriageInitialFollowUp(): string {
  return 'Hello, welcome to Medora Health. We have received your basic information. Based on your condition, we still need 3 short follow-up answers. You may answer them or skip for now.';
}
```

Implementation notes:
- Records prompt must explicitly say intake is already received.
- Recommendation prompt must branch on `answered` versus `skipped` triage.
- Process explanation copy must branch on `selected` versus `skipped` hospital choice.
- Keep recommendation real: candidate list + reason generation must still come from `RecommendationAgent`.
- Keep the LLM adapter tests in `records-llm-adapter.test.ts` and `recommendation-llm-adapter.test.ts` focused on prompt-branch selection itself, not only on final composer text.

- [ ] **Step 4: Verify copy and adapter behavior**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/records-route-adapter.test.ts src/routes/chatbot-v3/recommendation-route-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the prompt/composer slice**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  apps/api/src/routes/chatbot-v3/records-prompts.ts \
  apps/api/src/routes/chatbot-v3/recommendation-prompts.ts \
  apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts \
  apps/api/src/routes/chatbot-v3/records-route-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/recommendation-route-adapter.test.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "feat(chatbot-v3): rewrite post-intake conversation copy"
```

### Task 6: Lock the new flow with mounted session regressions

**Files:**
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- Modify: `apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts` (only if action submission helpers are needed)

- [ ] **Step 1: Write failing mounted session regressions**

```ts
it('acknowledges intake, allows triage skip, then shows recommendation from intake-only facts', async () => {
  const opening = await driver.send({ message: 'Hello' });
  expect(opening.body.messages[0]?.text).toContain('we have received your basic information');
  expect(opening.body.statusSnapshot).toMatchObject({
    intakeAcknowledged: true,
    minimalTriageStatus: 'pending',
    recommendationSelectionStatus: 'pending',
  });

  const skipped = await driver.send({
    message: '',
    action: { type: 'TRIAGE_SKIPPED' },
  });
  expect(skipped.body.journey.stage).toBe('RECOMMENDATION');
  expect(skipped.body.cards.some((card) => card.cardType === 'RECOMMENDATION_LIST')).toBe(true);
  expect(skipped.body.statusSnapshot.minimalTriageStatus).toBe('skipped');
  expect(skipped.body.statusSnapshot.minimalTriageComplete).toBe(true);
});

it('acknowledges hospital selection choice and then explains process', async () => {
  // seed or drive a prior recommendation-rendered turn first so recommendationPresented=true
  await seedRecommendationPresentedSession({ selectionStatus: 'pending' });
  const selected = await driver.send({
    message: '',
    action: { type: 'RECOMMENDATION_SELECTED', hospitalId: 'hospital-1' },
  });
  expect(selected.body.messages[0]?.text).toContain('you have selected');
  expect(selected.body.statusSnapshot.recommendationSelectionStatus).toBe('selected');
  expect(selected.body.statusSnapshot.recommendationSelectedHospitalIds).toEqual(['hospital-1']);

  const processTurn = await driver.send({ message: 'next step' });
  expect(processTurn.body.journey.stage).toBe('EXPLAIN_PROCESS');
  expect(processTurn.body.messages[0]?.text).toContain('medical tourism process');
  expect(getPersistedSession().statusSnapshot.processExplained).toBe(true);
  expect(processTurn.body.statusSnapshot.processExplained).toBe(true);
});

it('acknowledges skipped hospital choice and still explains process without marking selection as chosen', async () => {
  await seedRecommendationPresentedSession({ selectionStatus: 'pending' });
  const skipped = await driver.send({
    message: '',
    action: { type: 'RECOMMENDATION_SKIPPED' },
  });
  expect(skipped.body.messages[0]?.text).toContain('you have not selected a hospital yet');
  expect(skipped.body.statusSnapshot.recommendationSelectionStatus).toBe('skipped');

  const processTurn = await driver.send({ message: 'next step' });
  expect(processTurn.body.journey.stage).toBe('EXPLAIN_PROCESS');
  expect(processTurn.body.messages[0]?.text).toContain('medical tourism process');
  expect(getPersistedSession().statusSnapshot.recommendationSelectionStatus).toBe('skipped');
  expect(getPersistedSession().statusSnapshot.processExplained).toBe(true);
  expect(processTurn.body.statusSnapshot.processExplained).toBe(true);
});
```

- [ ] **Step 2: Run the mounted session tests to verify they fail**

Run: `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts`
Expected: FAIL because the current flow never acknowledges intake or models skip/select actions.

- [ ] **Step 3: Add helper support only if the current driver cannot submit actions cleanly**

```ts
await driver.send({
  message: '',
  action: { type: 'RECOMMENDATION_SKIPPED' },
});
```

Implementation notes:
- Only extend the driver if raw request construction becomes repetitive.
- Do not build a second testing abstraction if the current driver can already send arbitrary request bodies.

- [ ] **Step 4: Run the full targeted verification suite**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.routes.test.ts src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/records-route-adapter.test.ts src/routes/chatbot-v3/recommendation-route-adapter.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api typecheck`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application typecheck`
Expected: PASS.

- [ ] **Step 5: Commit the session-regression slice**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot add \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts \
  apps/api/src/__tests__/helpers/chatbot-v3-session-driver.ts
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot commit -m "test(chatbot-v3): lock post-intake session flow"
```

## Final Verification

- [ ] **Step 1: Run the end-to-end targeted verification stack**

Run:
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/infrastructure test -- packages/infrastructure/database/repositories/__tests__/drizzle-ai-chat-session.repository.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.routes.test.ts src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/records-route-adapter.test.ts src/routes/chatbot-v3/recommendation-route-adapter.test.ts`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/domain typecheck`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/validation typecheck`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/application typecheck`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/infrastructure typecheck`
- `pnpm --dir /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot --filter @medical-crm/api typecheck`
Expected: PASS.

- [ ] **Step 2: Commit the final integration pass (only if verification required follow-up fixes)**

```bash
git -C /Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase-2bc-ai-chatbot status --short
```

Expected: clean working tree, or one final commit containing only the fixes needed to make the verification stack pass.
