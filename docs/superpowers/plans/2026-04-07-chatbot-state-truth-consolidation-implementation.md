# Chatbot State Truth Consolidation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant chatbot orchestration/session cache fields and make case/questionnaire/CHC/message history the only business truth used by CRM, Dify, and frontend contracts.

**Architecture:** Collapse patient-facing and Dify-facing contracts around truth-derived state. Keep only summary/strategy cache fields that are not business truth. Delete stale pending/offer/selected-hospital snapshot fields from writeback, context, DTOs, and Dify workflow wiring so the chatbot cannot drift from submitted questionnaire and selected-hospital truth.

**Tech Stack:** TypeScript, Hono, Vitest, pnpm/turbo, Dify DSL YAML

---

### Task 1: Lock the desired contracts with failing tests

**Files:**
- Modify: `apps/api/src/__tests__/dify-workflow.contract.test.ts`
- Modify: `apps/api/src/__tests__/internal.routes.test.ts`
- Modify: `apps/api/src/__tests__/chatbot.routes.test.ts`
- Modify: `packages/application/__tests__/patient-auth/get-patient-session-state.test.ts`
- Modify: `packages/application/src/services/__tests__/policy-engine/context-builder.service.test.ts`
- Modify: `packages/application/src/services/__tests__/policy-engine/writeback-planner.service.test.ts`
- Modify: `packages/application/src/services/__tests__/policy-engine/writeback-executor.service.test.ts`
- Modify: `packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.test.ts`

- [ ] Step 1: Add assertions that `/api/patient/me.chatbotOrchestrationState` only exposes `conversationSummary`
- [ ] Step 2: Add assertions that internal ai-policy context no longer returns `pending_offer`, `pending_question`, `selected_hospital_id`, `lead_maturity`, `last_next_action`, `last_resolved_intent`
- [ ] Step 3: Add assertions that Dify workflow no longer references `pendingOffer`, `pendingQuestion`, `selectedHospitalId`, `prequalificationReasonCodes`, or `leadMaturity`
- [ ] Step 4: Add assertions that writeback planning/execution no longer writes `pendingQuestion`, `selectedHospitalId`, `prequalificationReasonCodes`, or `lastNextAction`
- [ ] Step 5: Run targeted tests and confirm they fail for the expected contract mismatch reasons

### Task 2: Remove redundant fields from domain and application models

**Files:**
- Modify: `packages/domain/src/entities/ai-chat-session.entity.ts`
- Modify: `packages/application/src/services/policy-engine/context-builder.service.ts`
- Modify: `packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
- Modify: `packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Modify: `packages/application/src/services/policy-engine/action-planner.service.ts`

- [ ] Step 1: Remove deleted fields from `AiChatStatusSnapshot`
- [ ] Step 2: Update context builder types and derived runtime context to stop reading deleted fields
- [ ] Step 3: Rework active hospital derivation to use page context, recent user messages, CHC/case truth, and recent shortlist instead of `statusSnapshot.selectedHospitalId`
- [ ] Step 4: Remove deleted fields from ai-policy context DTO output
- [ ] Step 5: Remove deleted fields and bridges from ai-policy decide output/writeback plan
- [ ] Step 6: Run targeted tests and confirm model/context tests pass

### Task 3: Remove redundant writeback fields and questionnaire shadow state

**Files:**
- Modify: `apps/api/src/routes/internal.routes.ts`
- Modify: `packages/application/src/use-cases/ai-policy/apply-ai-policy-writeback.use-case.ts`
- Modify: `packages/application/src/services/policy-engine/writeback-planner.service.ts`
- Modify: `packages/application/src/services/policy-engine/writeback-executor.service.ts`
- Modify: `packages/application/src/use-cases/patient-dashboard/submit-patient-qc-response.use-case.ts`

- [ ] Step 1: Stop parsing deleted fields from internal writeback route payload
- [ ] Step 2: Remove deleted fields from writeback input types and message metadata
- [ ] Step 3: Stop generating `pendingQuestion` shadow state on `REQUEST_DOC_UPLOAD`
- [ ] Step 4: Keep questionnaire submit flow aligned with case truth without depending on pending-question cache
- [ ] Step 5: Run writeback and patient-protected tests until green

### Task 4: Clean chatbot routes and block rendering to use truth-derived questionnaire logic

**Files:**
- Modify: `apps/api/src/routes/chatbot.routes.ts`
- Modify: `apps/api/src/routes/patient-widget-starter.ts`
- Modify: `apps/api/src/routes/chatbot-block-builder.ts`

- [ ] Step 1: Remove deleted Dify inputs from chatbot public route and widget starter
- [ ] Step 2: Replace pending-question template resolution with truth-derived questionnaire/template lookup
- [ ] Step 3: Ensure questionnaire blocks render only when case/questionnaire truth says the form is not submitted
- [ ] Step 4: Run chatbot route tests and verify the stale questionnaire bug path is covered

### Task 5: Clean Dify DSL and internal workflow contract

**Files:**
- Modify: `dify-config/medora-ai-chatbot-v1.dsl.yml`
- Modify: `apps/api/src/__tests__/dify-workflow.contract.test.ts`

- [ ] Step 1: Remove deleted inputs and fields from `decide_http`, `context_http`, `parse_decide_code`, and `writeback_http`
- [ ] Step 2: Remove obsolete FAQ normalize nodes that reference non-existent retrieval ids
- [ ] Step 3: Keep composer inputs aligned with the new backend context contract
- [ ] Step 4: Run workflow contract tests until green

### Task 6: Update frontend contract and verify end-to-end expectations

**Files:**
- Modify: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/services/api/crmApiClient.ts`
- Modify: any directly dependent frontend types/usages discovered by ripgrep

- [ ] Step 1: Remove deleted `chatbotOrchestrationState` fields from frontend API types
- [ ] Step 2: Update any frontend usage to read questionnaire/hospital truth from the correct fields
- [ ] Step 3: Run the smallest relevant frontend type/test checks that cover the touched files
- [ ] Step 4: Run final targeted backend tests, then summarize remaining gaps if any

---

Plan complete and saved to `docs/superpowers/plans/2026-04-07-chatbot-state-truth-consolidation-implementation.md`. Execution is starting in this session.
