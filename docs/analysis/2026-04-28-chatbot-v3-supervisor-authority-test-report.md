# Chatbot V3 Supervisor / Authority Test Report

Repo: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/phase1-test-doc`
Branch: `docs/phase1-test-doc`
Base HEAD before this repair commit: `9f69234`
Date: `2026-04-28`

## Current Status

The earlier report for `a924bae` found real stale tests and behavior gaps. This repair pass rewrote the stale tests, fixed the confirmed runtime issues, and ran review-until-clean. The current local code is no longer in the old "34/60 mounting tests failed" state.

Current result:

- Chatbot-v3 mounting suite: PASS, 60/60.
- Chatbot-v3 focused API suites: PASS, 188/188.
- Application supervisor/authority focused suites: PASS, 124/124.
- API non-DB full suite: PASS, 60 files / 848 tests.
- `@medical-crm/application` typecheck: PASS.
- `git diff --check`: PASS.
- Full API suite including `chatbot.routes.integration.test.ts`: BLOCKED by local integration DB authentication failure (`PostgresError` code `08006`), not by chatbot-v3 assertions.
- `@medical-crm/api` typecheck: BLOCKED by known unrelated pre-existing errors in `composition-root.ts`, `chatbot.routes.ts`, and `patient-widget-starter.ts`.

## Repairs Verified

- v2 chatbot write cutover now returns 410 before Dify/service work.
- v2 chatbot history drain now returns 410 after the drain window closes.
- Raw legacy `minimalTriageComplete: true` is treated as canonical status-snapshot truth in:
  - domain facts normalization
  - JourneyRuntimeAuthority recommendation prerequisites
  - SupervisorService fallback/proposal path
- Arbitrary stale facts alone are still not trusted for minimal triage completion.
- Active handoff/crisis state projects `HUMAN_HANDOFF` over stale stored journey snapshots.
- Records and Supervisor LLM failure metadata now reaches runtime observability.
- Supervisor metadata uses per-call result paths, so singleton `getLastLlmRunMetadata()` state is not reused when per-call metadata is explicitly `null`.
- The stale duplicate `internal-faq-eval.routes.test.ts` file was removed; `internal.faq-eval.routes.test.ts` is the current canonical test.

## Verification Commands

```bash
pnpm --filter @medical-crm/application test -- \
  src/services/__tests__/chatbot-v3/supervisor.service.test.ts \
  src/services/__tests__/chatbot-v3/domain-facts-normalizer.test.ts \
  src/services/__tests__/chatbot-v3/journey-session.test.ts \
  src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts \
  --maxWorkers=1

pnpm --filter @medical-crm/application typecheck

pnpm --filter @medical-crm/api test -- \
  src/__tests__/chatbot-v3.routes.test.ts \
  src/__tests__/chatbot-v3.observability.test.ts \
  src/routes/chatbot-v3/supervisor-route-adapter.test.ts \
  src/routes/chatbot-v3/supervisor-prompt.test.ts \
  src/routes/chatbot-v3/records-route-adapter.test.ts \
  src/routes/chatbot-v3/records-llm-adapter.test.ts \
  src/__tests__/chatbot-v3.mounting.test.ts \
  --maxWorkers=1

pnpm --filter @medical-crm/api test -- --maxWorkers=1 \
  --exclude src/__tests__/chatbot.routes.integration.test.ts

git diff --check
```

Additional targeted regressions were run for:

- raw legacy `minimalTriageComplete`
- stale supervisor metadata with explicit per-call `null`
- Supervisor/Records runtime LLM failure metadata

## Blocked Verification

`pnpm --filter @medical-crm/api test -- src/__tests__/chatbot.routes.integration.test.ts --maxWorkers=1`

Current blocker:

```text
PostgresError: connection failure during authentication
code: 08006
```

The integration suite could not complete because the local integration database connection failed during cleanup. A temporary hook-timeout experiment was reverted; no diff remains in that integration test file.

`pnpm --filter @medical-crm/api typecheck`

Known unrelated errors still present:

- `src/composition-root.ts`: duplicate `conversationRepo` and wrong repository argument.
- `src/routes/chatbot.routes.ts`: unused `tryResolveAdminConversationForChatbotSession`.
- `src/routes/patient-widget-starter.ts`: readonly `shortlist` type mismatch.

## Review Result

Review-until-clean found and fixed these issues:

- Records LLM failure metadata was captured but filtered before runtime observability.
- Supervisor route adapter swallowed request/http/json/content failure metadata.
- Supervisor metadata side channel could cross-contaminate concurrent turns.
- Explicit per-call `null` metadata still fell back to stale singleton metadata.
- JourneyRuntimeAuthority and Supervisor fallback paths still ignored raw legacy `minimalTriageComplete`.
- Stale analysis docs contradicted current verification.

Latest code-path review found no remaining meaningful SupervisorService, authority prerequisite, route adapter metadata, or runtime metadata findings.
