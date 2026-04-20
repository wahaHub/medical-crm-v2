# Chatbot V3 Control-Plane Repair Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the deployed `chatbot-v3` control plane so structured post-intake state drives progression, current journey stage persists across turns, revisit turns behave as temporary detours instead of overwriting the primary stage, later-stage uploads no longer regress to minimal triage, supporting documents remain minimally tracked across re-entry, and consult progression follows the real post-recommendation sequence.

**Architecture:** Keep the supervisor-led v3 architecture, but upgrade its decision contract. Persist `journeyCurrentStage/journeyCurrentPhase`, treat revisit handling as a turn-local detour rather than a persisted stage rewrite, feed structured triage/recommendation/document state into runtime, supervisor, and authority, remove the global attachment bootstrap override, and make route persistence/replay boundaries robust to serialized write intents. Use the smallest v1 supporting-document truth possible: an append-only `{ path, name }[]` list.

**Tech Stack:** TypeScript, Hono, Vitest, Zod, Drizzle ORM, supervisor-led `chatbot-v3` runtime.

---

## File Map

### Existing files to modify
- `packages/domain/src/entities/ai-chat-session.entity.ts`
  - Add persisted journey snapshot fields and minimal supporting-document list semantics; stop treating richer post-intake fields as boolean-first control truth.
- `packages/domain/__tests__/ai-chat-session.entity.test.ts`
  - Cover journey snapshot persistence, supporting-document list normalization/dedupe, structured recommendation/triage derivations, and hard-cutover read behavior.
- `packages/infrastructure/database/schema/schema.ts`
  - Add columns for journey stage/phase and supporting documents.
- `packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`
  - Read/write the new journey snapshot and supporting-documents fields; normalize replayed timestamp writes safely; hydrate legacy supporting-document evidence when reconstructable.
- `packages/application/src/services/chatbot-v3/types.ts`
  - Extend decision/runtime types so structured state is available to supervisor and authority without collapsing to old aliases.
- `packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - Remove attachment bootstrap override, consume structured recommendation/triage state, and drive process/consult fallback from the repaired contract.
- `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
  - Gate `EXPLAIN_PROCESS`, `COLLECT_MEDICAL_INPUTS`, and `ONLINE_CONSULT` from the repaired state model.
- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - Lock skip/selected/process/consult fallback semantics and removal of global attachment override.
- `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
  - Lock new stage gates, re-entry behavior, and consult prerequisites.
- `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
  - Keep attachment-only support and ensure action payload schema remains aligned with repaired progression semantics.
- `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`
  - Cover attachment-only, structured action semantics, and no-regression schema expectations.
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - Persist and read journey snapshot, propagate structured state to the control plane, remove recommendation-stage collapse, and repair document upload routing.
- `apps/api/src/routes/chatbot-v3.routes.ts`
  - Persist authority-approved journey snapshot and supporting-document updates atomically; keep replay-safe writeback.
- `apps/api/src/routes/chatbot-v3/response-composer.ts`
  - Render recommendation/process/supporting-documents copy from repaired stage truth and keep client-facing journey payload aligned with the persisted primary stage during revisits.
- `apps/api/src/routes/chatbot-v3/records-route-adapter.ts`
  - Normalize supporting-document additions into the minimal `{ path, name }[]` contract without classification.
- `apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
  - Ensure the records path does not reintroduce diagnosis classification or cold-start intake assumptions.
- `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`
  - Keep answered-vs-skipped recommendation wording stable after control-plane repair.
- `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
  - Cover post-recommendation wording, repeatable supporting-document stage entry, and no minimal-triage regression after later uploads.
- `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
  - Cover route persistence of journey snapshot, replay-safe timestamps, and upload semantics.
- `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
  - Add full multi-turn regressions for skip->process, selected->process->supporting-documents, revisit detours that preserve the primary stage, repeated uploads, retry continuity, and no collapse to minimal triage.

### New files to create
- `packages/infrastructure/database/migrations/038_ai_chat_journey_snapshot_and_supporting_documents.sql`
  - Add persisted journey stage/phase and supporting-documents storage for chatbot-v3 repair.

## Chunk 1: Persist Journey Snapshot And Supporting Documents

### Task 1: Add the missing persisted v1 repair fields

**Files:**
- Create: `packages/infrastructure/database/migrations/038_ai_chat_journey_snapshot_and_supporting_documents.sql`
- Modify: `packages/infrastructure/database/schema/schema.ts`
- Modify: `packages/domain/src/entities/ai-chat-session.entity.ts`
- Modify: `packages/domain/__tests__/ai-chat-session.entity.test.ts`
- Modify: `packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts`

- [ ] **Step 1: Write the failing domain tests for the new persisted fields**

```ts
it('defaults journey snapshot to null and supporting documents to an empty list', () => {
  const session = new AiChatSession({
    // existing fixture props
    statusSnapshot: {},
  });

  expect(session.statusSnapshot.journeyCurrentStage).toBeNull();
  expect(session.statusSnapshot.journeyCurrentPhase).toBeNull();
  expect(session.statusSnapshot.supportingDocuments).toEqual([]);
});

it('normalizes supporting documents to minimal path/name pairs only', () => {
  const session = new AiChatSession({
    // existing fixture props
    statusSnapshot: {
      supportingDocuments: [
        { path: 'uploads/doc-a.pdf', name: 'doc-a.pdf', ignored: 'x' },
      ] as never,
    },
  });

  expect(session.statusSnapshot.supportingDocuments).toEqual([
    { path: 'uploads/doc-a.pdf', name: 'doc-a.pdf' },
  ]);
});

it('hydrates persisted journey snapshot without reconstructing a different current stage', () => {
  const session = new AiChatSession({
    // existing fixture props
    statusSnapshot: {
      journeyCurrentStage: 'EXPLAIN_PROCESS',
      journeyCurrentPhase: 'active',
      recommendationSelectionStatus: 'selected',
    },
  });

  expect(session.statusSnapshot.journeyCurrentStage).toBe('EXPLAIN_PROCESS');
  expect(session.statusSnapshot.journeyCurrentPhase).toBe('active');
});

it('deduplicates supporting documents by path', () => {
  const session = new AiChatSession({
    // existing fixture props
    statusSnapshot: {
      supportingDocuments: [
        { path: 'uploads/doc-a.pdf', name: 'doc-a.pdf' },
        { path: 'uploads/doc-a.pdf', name: 'renamed.pdf' },
      ] as never,
    },
  });

  expect(session.statusSnapshot.supportingDocuments).toEqual([
    { path: 'uploads/doc-a.pdf', name: 'doc-a.pdf' },
  ]);
});
```

- [ ] **Step 2: Run the domain test file to confirm failure**

Run: `pnpm --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
Expected: FAIL because the new fields do not exist or do not normalize yet.

- [ ] **Step 3: Add the migration and schema columns**

```sql
ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS journey_current_stage TEXT,
  ADD COLUMN IF NOT EXISTS journey_current_phase TEXT,
  ADD COLUMN IF NOT EXISTS supporting_documents JSONB;
```

Keep the migration additive only. Do not remove or rewrite older chatbot-v3 columns in this step.

- [ ] **Step 4: Implement domain normalization and serialization for the new fields**

Implement the smallest v1 normalization rules:

```ts
journeyCurrentStage: valid stage string or null
journeyCurrentPhase: 'active' | 'post' | null
supportingDocuments: Array<{ path: string; name: string }>
```

Do not add classification or extra metadata.

- [ ] **Step 4a: Enforce hard-cutover semantics for missing supporting documents**

When `supportingDocuments` is absent:
- do not hydrate or reconstruct it from older upload evidence
- treat the session as outside the repaired continuity contract
- keep reads null-safe, but do not add migration-only gating fallbacks

- [ ] **Step 5: Wire repository row mapping and patch/save support**

Repository must:
- round-trip the new fields through `save`, `rowToEntity`, and `patchStatus`
- keep `supportingDocuments` append-friendly
- not assume timestamps are always `Date` objects

- [ ] **Step 6: Add the replay-safe timestamp failing test**

```ts
it('accepts ISO-string replay timestamps during patchStatus', async () => {
  const patched = await repository.patchStatus('session-1', 'beauty', {
    lastUserMessageAt: '2026-04-19T08:00:00.000Z' as never,
    lastAssistantMessageAt: '2026-04-19T08:00:00.000Z' as never,
  });

  expect(patched).not.toBeNull();
});
```

- [ ] **Step 7: Run repository/domain tests to green**

Run:
- `pnpm --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
- `pnpm --filter @medical-crm/domain typecheck`

Expected: PASS.

- [ ] **Step 8: Commit Chunk 1**

```bash
git add \
  packages/infrastructure/database/migrations/038_ai_chat_journey_snapshot_and_supporting_documents.sql \
  packages/infrastructure/database/schema/schema.ts \
  packages/domain/src/entities/ai-chat-session.entity.ts \
  packages/domain/__tests__/ai-chat-session.entity.test.ts \
  packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts

git commit -m "feat(chatbot-v3): persist journey snapshot and supporting documents"
```

## Chunk 2: Repair Control-Plane Inputs And Remove Attachment Override

### Task 2: Make supervisor/runtime consume structured state directly

**Files:**
- Modify: `packages/application/src/services/chatbot-v3/types.ts`
- Modify: `packages/application/src/services/chatbot-v3/supervisor.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`

- [ ] **Step 1: Write the failing supervisor/runtime tests**

```ts
it('treats recommendation skip as a real branch that should continue to process explanation', () => {
  const suggestion = service.suggest({
    current: { stage: 'RECOMMENDATION', phase: 'active' },
    recommendation: { selectionStatus: 'skipped', selectedHospitalIds: [] },
    facts: { 'process.explained': false, 'handoff.active': false },
    // ...other required input
  });

  expect(suggestion.suggestedStage).toBe('EXPLAIN_PROCESS');
});

it('does not reroute later-stage attachments back to minimal triage', async () => {
  const normalized = invokeNormalize({
    current: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
    attachments: [attachmentFixture],
    bootstrap: { attachments: [attachmentFixture], message: '' },
  });

  expect(normalized.statusSnapshot?.journeyCurrentStage).not.toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
});
```

- [ ] **Step 2: Run the targeted test files and confirm failure**

Run:
- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts`

Expected: FAIL on skip/process and attachment regression expectations.

- [ ] **Step 3: Extend the decision input types with structured state**

Add explicit control-plane input fields for:
- `journeyCurrentStage`
- `journeyCurrentPhase`
- `minimalTriageStatus`
- `minimalTriageAnswersSummary`
- `recommendationSelectionStatus`
- `recommendationSelectedHospitalIds`
- `supportingDocuments`

Do not reintroduce boolean aliases as primary decision inputs.

- [ ] **Step 3a: Audit remaining boolean-first progression helpers**

Search runtime/read-side/application helpers for boolean-first chatbot progression logic and either:
- remove it
- or delete it if it only exists to preserve older boolean-first behavior

Do not leave hidden boolean-first progression shortcuts outside supervisor/authority.

- [ ] **Step 4: Remove the attachment bootstrap override from supervisor fallback**

Delete or retire the `attachments_to_minimal_triage` canonical behavior.

Expected end state:
- direct human request override still exists
- attachment presence alone no longer overrides stage selection

- [ ] **Step 5: Update runtime to build supervisor/authority input from structured state**

Runtime should:
- read persisted journey snapshot first
- pass structured triage/recommendation/doc state into the control plane
- stop treating skip/select as boolean-only facts

- [ ] **Step 6: Keep schema/action tests aligned**

Ensure request schema and route tests still cover:
- `TRIAGE_SUBMITTED`
- `TRIAGE_SKIPPED`
- `RECOMMENDATION_SELECTED`
- `RECOMMENDATION_SKIPPED`
- attachment-only requests

- [ ] **Step 7: Run targeted tests to green**

Run:
- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
- `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts`
- `pnpm --filter @medical-crm/application typecheck`
- `pnpm --filter @medical-crm/api typecheck`

Expected: PASS.

- [ ] **Step 8: Commit Chunk 2**

```bash
git add \
  packages/application/src/services/chatbot-v3/types.ts \
  packages/application/src/services/chatbot-v3/supervisor.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts

git commit -m "fix(chatbot-v3): remove attachment override and use structured control state"
```

## Chunk 3: Persist Journey Decisions And Repair Post-Recommendation Gates

### Task 3: Make current journey state durable and rebuild later-stage gating

**Files:**
- Modify: `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`
- Modify: `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/runtime.service.ts`
- Modify: `apps/api/src/routes/chatbot-v3.routes.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.ts`
- Modify: `apps/api/src/routes/chatbot-v3/response-composer.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`

- [ ] **Step 1: Write failing authority/mounting tests for the full repaired sequence**

```ts
it('advances recommendation skipped into explain process instead of staying in recommendation', () => {
  const decision = authority.decide({
    current: { stage: 'RECOMMENDATION', phase: 'active' },
    recommendation: { selectionStatus: 'skipped', selectedHospitalIds: [] },
    facts: { 'process.explained': false, 'handoff.active': false },
    // ...other required input
  });

  expect(decision.outcome).toBe('ALLOW');
  expect(decision.to.stage).toBe('EXPLAIN_PROCESS');
});

it('does not allow online consult immediately after selected + explained when supporting documents are still expected', () => {
  const decision = authority.decide({
    current: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
    recommendation: { selectionStatus: 'selected', selectedHospitalIds: ['hospital-1'] },
    records: { supportingDocuments: [] },
    facts: { 'process.explained': true, 'handoff.active': false },
    // ...other required input
  });

  expect(decision.outcome).toBe('DENY');
});

it('keeps later uploads in the supporting-documents journey instead of collapsing to minimal triage', async () => {
  const transcript = await runSession([
    answeredToRecommendation,
    selectHospital,
    askForProcess,
    uploadSupportingDocument,
  ]);

  expect(last(transcript).journey.stage).not.toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
});
```

- [ ] **Step 2: Run targeted authority and mounting tests to confirm failure**

Run:
- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
- `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts`

Expected: FAIL on skip/process, consult gate, or upload collapse.

- [ ] **Step 3: Extend authority to emit and own persisted journey snapshot writes**

Authority-approved write contract must now include:
- `journeyCurrentStage`
- `journeyCurrentPhase`

Those values must be written on every successful stage decision, not only inferred later.

- [ ] **Step 4: Change current-stage derivation to prefer persisted journey snapshot first**

Runtime derivation order should become:
1. persisted journey snapshot
2. legacy crisis/handoff overrides if stronger
3. no legacy fallback reconstruction for sessions that lack journey snapshot

Do not keep the current blanket `default -> RECOMMENDATION` behavior for repaired sessions.

- [ ] **Step 5: Rebuild post-recommendation gates**

Authority rules must explicitly support:
- `RECOMMENDATION_SELECTED -> EXPLAIN_PROCESS`
- `RECOMMENDATION_SKIPPED -> EXPLAIN_PROCESS`
- `EXPLAIN_PROCESS -> COLLECT_MEDICAL_INPUTS`
- consult only after the post-recommendation sequence is satisfied

Treat `COLLECT_MEDICAL_INPUTS` as re-enterable.

Define the v1 consult gate explicitly as:
- `recommendationSelectionStatus === 'selected'`
- `process.explained === true`
- at least one supporting document is available for the session within the repaired session contract

- [ ] **Step 5a: Add revisit preservation tests**

Lock these semantics explicitly:
- recommendation compare / reselect turns may dispatch recommendation handling again
- repeat explain turns may dispatch process handling again
- those revisit turns must not overwrite `journeyCurrentStage/journeyCurrentPhase` unless an explicit progression-changing action was submitted

- [ ] **Step 6: Update response composer wording to reflect the repaired sequence**

Expected user-facing order:
- recommendation
- process explanation
- supporting documents
- consult

Do not regress to generic or old-order copy.

- [ ] **Step 6a: Lock revisit response semantics**

Add tests to prove that during recommendation/process revisits:
- client-facing `journey.stage` / `journey.phase` remain the persisted primary stage
- revisit-specific handling appears through cards/messages/rendering, not a silent primary-stage rewrite

- [ ] **Step 7: Run the repaired authority/mounting/response tests to green**

Run:
- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
- `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/response-composer.test.ts src/__tests__/chatbot-v3.mounting.test.ts`
- `pnpm --filter @medical-crm/application typecheck`
- `pnpm --filter @medical-crm/api typecheck`

Expected: PASS.

- [ ] **Step 8: Commit Chunk 3**

```bash
git add \
  packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts \
  packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts \
  apps/api/src/routes/chatbot-v3/runtime.service.ts \
  apps/api/src/routes/chatbot-v3.routes.ts \
  apps/api/src/routes/chatbot-v3/response-composer.ts \
  apps/api/src/routes/chatbot-v3/response-composer.test.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts

git commit -m "fix(chatbot-v3): persist journey state and repair later-stage progression"
```

## Chunk 4: Supporting-Document Routing, Replay Safety, And Full Regression Net

### Task 4: Finish records routing and end-to-end regression coverage

**Files:**
- Modify: `apps/api/src/routes/chatbot-v3/records-route-adapter.ts`
- Modify: `apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts`
- Modify: `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
- Modify: `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- Modify: `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
- Modify: `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`

- [ ] **Step 1: Write the failing end-to-end edge-case tests**

```ts
it('accepts attachment-only uploads after explain process without regressing to minimal triage', async () => {
  const transcript = await runSession([
    answeredToRecommendation,
    selectHospital,
    processExplanation,
    attachmentOnlyUpload,
  ]);

  expect(last(transcript).journey.stage).toBe('COLLECT_MEDICAL_INPUTS');
});

it('allows COLLECT_MEDICAL_INPUTS to re-enter and append more files later', async () => {
  const transcript = await runSession([
    answeredToRecommendation,
    selectHospital,
    processExplanation,
    firstUpload,
    continueFlow,
    secondUpload,
  ]);

  expect(readPersistedSupportingDocuments(transcript)).toEqual([
    { path: 'uploads/doc-1.pdf', name: 'doc-1.pdf' },
    { path: 'uploads/doc-2.pdf', name: 'doc-2.pdf' },
  ]);
});

it('replaying recommendation selection with the same idempotency key does not 500', async () => {
  const first = await sendSelection({ idempotencyKey: 'same-key' });
  const second = await sendSelection({ idempotencyKey: 'same-key' });

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
});
```

- [ ] **Step 2: Run targeted route/mounting/schema tests and confirm failure**

Run:
- `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.mounting.test.ts`
- `pnpm --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`

Expected: FAIL on upload regression, re-entry, or replay safety.

- [ ] **Step 3: Update records routing to append minimal supporting-document truth**

Records handling should:
- accept later-stage attachment uploads
- append `{ path, name }` entries to `supportingDocuments`
- dedupe by `path`
- avoid document classification
- avoid regressing the journey stage to minimal triage

- [ ] **Step 4: Keep schema and adapters minimal**

Do not add new classification or document-label actions.
Keep v1 request semantics limited to:
- message
- attachments
- existing structured action keys

- [ ] **Step 5: Verify replay-safe persistence end-to-end**

Route + repository should now tolerate replayed write intents with string timestamps.
Add or adjust tests so a repeated selection or repeated structured action no longer crashes.

- [ ] **Step 6: Run the full regression net**

Run:
- `pnpm --filter @medical-crm/domain test -- __tests__/ai-chat-session.entity.test.ts`
- `pnpm --filter @medical-crm/domain typecheck`
- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
- `pnpm --filter @medical-crm/application typecheck`
- `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.routes.test.ts src/__tests__/chatbot-v3.mounting.test.ts src/routes/chatbot-v3/response-composer.test.ts src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`
- `pnpm --filter @medical-crm/api typecheck`
- `pnpm --filter @medical-crm/validation test -- src/__tests__/chatbot-v3/chat.schema.test.ts`

Expected: PASS.

- [ ] **Step 7: Re-run deployed live session matrix after code is landed and redeployed**

Use the deployed session plan at:
- `docs/analysis/2026-04-19-chatbot-v3-deployed-session-test-plan.md`

Re-check at minimum:
- skipped branch -> process
- selected branch -> process -> supporting documents
- later-stage attachment-only upload
- repeated supporting-document upload
- recommendation revisit without primary-stage drift
- recommendation revisit response still reports the persisted primary stage
- repeat explain without primary-stage drift
- idempotent selection replay
- full answered happy path
- full skipped happy path

Document the final deployed results in a fresh artifact directory.

- [ ] **Step 8: Commit Chunk 4**

```bash
git add \
  apps/api/src/routes/chatbot-v3/records-route-adapter.ts \
  apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts \
  apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts \
  apps/api/src/__tests__/chatbot-v3.routes.test.ts \
  apps/api/src/__tests__/chatbot-v3.mounting.test.ts \
  packages/shared/validation/src/chatbot-v3/chat.schema.ts \
  packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts

git commit -m "fix(chatbot-v3): stabilize supporting-document uploads and replay safety"
```

## Notes For Execution

- Do not reintroduce boolean-first progression logic for recommendation or triage.
- Do not add document classification, OCR, or user-confirmed labels.
- Do not keep any global `attachment -> minimal triage` override after this repair.
- Prefer authority-owned and persisted stage truth over reconstructed stage heuristics.
- Keep `COLLECT_MEDICAL_INPUTS` re-enterable in both code and tests.
- When adding persistence for `supportingDocuments`, normalize strictly to `{ path, name }[]` and ignore extra metadata.

Plan complete and saved to `docs/superpowers/plans/2026-04-19-chatbot-v3-control-plane-repair-implementation.md`. Ready to execute?
