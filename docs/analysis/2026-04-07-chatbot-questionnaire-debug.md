# Chatbot Questionnaire Debug Analysis

Date: 2026-04-07

## Scope

This document analyzes the questionnaire-related chatbot issues across:

- CRM backend: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2`
- China frontend: `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys`
- Dify workflow config: `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config`

I checked both repository code and the live deployed stack on April 7, 2026.

## Executive Summary

There are two different classes of problems.

1. The repeated `Open questionnaire` behavior is mostly a design / policy-engine issue, not a frontend rendering bug.
2. The "I submitted the form but the bot still says it was not received" behavior is a real production data-sync bug, and the live backend behavior does not match the code currently in this repo.

The biggest production finding is this:

- On the live system, questionnaire submission succeeds.
- The patient case state becomes `medicalFormStatus = SUBMITTED`.
- The saved questionnaire response exists and is readable.
- But the widget chatbot session still keeps `pendingQuestion = QUESTIONNAIRE` and `lastNextAction = REQUEST_DOC_UPLOAD`.
- Because of that stale widget session state, later chatbot turns still think the questionnaire is pending and keep rendering `Open questionnaire`.

That means the live deployment is not clearing widget questionnaire state after submit, even though the current repo code says it should.

## Architecture

### Real request path

The live chatbot is not just "frontend -> Dify".

The actual path is:

1. Frontend sends widget chat message to CRM public endpoint:
   - `POST /api/v2/chatbot/chat`
2. CRM creates or loads `ai_chat_sessions`
3. CRM sends the message plus session status into Dify
4. Dify calls CRM internal policy endpoints:
   - `POST /api/v2/internal/ai-policy/decide`
   - `POST /api/v2/internal/ai-policy/context`
   - `POST /api/v2/internal/ai-policy/writeback`
5. CRM normalizes the Dify response
6. CRM builds rich blocks like questionnaire modal trigger
7. Frontend only renders the blocks returned by CRM

So the frontend is not inventing `Open questionnaire`. The backend is.

### Files that control the behavior

- CRM chat entry:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts`
- Rich block builder:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-block-builder.ts`
- Dify workflow:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v1.dsl.yml`
- AI policy decision:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/decide-ai-policy.use-case.ts`
- Action planner:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts`
- Patient questionnaire submit flow:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/patient-dashboard/submit-patient-qc-response.use-case.ts`
- Frontend render path:
  - `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/ChatMessageBlocks.tsx`
  - `/Users/haowang/Desktop/medora-health-beauty/medical-china-comb/china-medical-journeys/src/components/chat/PatientMedicalFormModal.tsx`

## Deployment Details Confirmed

From repo deployment defaults and live probing:

- CRM API base:
  - `https://crmapi.medicaltourismchina.health`
- Dify public app base:
  - `https://ai.medicaltourismchina.health/v1`
- Frontend production build points to CRM API:
  - `VITE_CRM_API_BASE_URL=https://crmapi.medicaltourismchina.health`
  - found in frontend deploy scripts
- Dify workflow depends on environment variables:
  - `crm_base_url`
  - `internal_api_secret`

Important detail:

- Directly calling the Dify app without first creating a CRM chat session is not a valid end-to-end test for this workflow.
- The correct live test path is `CRM /api/v2/chatbot/chat`, because the Dify workflow expects a CRM-backed `sessionId`.

## Issue-by-Issue Analysis

### Issue 1

User said:

- "我想去中国看病，你们有啥服务能帮我"

Observed by user:

- bot returned questionnaire CTA

What I found on April 7, 2026:

- I tested the live CRM endpoint with that exact message.
- I did **not** reproduce the questionnaire CTA on that prompt on April 7, 2026.
- The live response was:
  - `nextAction = EXPLAIN_MEDICAL_TRAVEL_PROCESS`
  - block type = `PROCESS_MODAL_TRIGGER`

Conclusion:

- This specific first-turn behavior appears to have changed since your earlier observation.
- As of April 7, 2026, this exact prompt no longer routes to questionnaire on the live stack I tested.

### Issue 2

User said:

- "我不想填表，我现在眼睛有点问题，想去看看眼睛"

Live reproduction on April 7, 2026:

- I reproduced this on the live CRM chat endpoint.
- The bot answer acknowledged "先不填表也可以".
- But the backend still returned:
  - `nextAction = REQUEST_DOC_UPLOAD`
  - `secondaryAction = SHOW_HOSPITAL_RECOMMENDATIONS`
  - questionnaire block with `Open questionnaire`

This is not a frontend bug.

#### Root cause

The current policy logic has no true "questionnaire refusal" intent/state.

In the current code:

- the semantic layer resolves this kind of message to hospital-direction intent
- then the action planner sees that recommendation flow needs documents first
- then it picks `REQUEST_DOC_UPLOAD`

Relevant rule:

- In [action-planner.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/policy-engine/action-planner.service.ts), `planCanonicalRecommendationPath()` returns `REQUEST_DOC_UPLOAD` whenever document status is still missing.

Then the CRM response layer does this:

- In [chatbot-block-builder.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-block-builder.ts), any `richAction = REQUEST_DOC_UPLOAD` automatically becomes a `QUESTIONNAIRE_MODAL_TRIGGER`.

And [chatbot.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts) has an additional fallback:

- even if `pendingQuestion` is not yet refreshed,
- if `richAction === REQUEST_DOC_UPLOAD`,
- it fetches the default questionnaire template and still builds the block.

So the current system behavior is:

- natural-language answer can say "you don't need to fill it now"
- but backend action still says `REQUEST_DOC_UPLOAD`
- therefore CRM still sends `Open questionnaire`

That contradiction is built into the current orchestration logic.

### Issue 3

User said:

- "我不想填表，你不要再给我显示 Open questionnaire 了"

Live reproduction on April 7, 2026:

- I reproduced a similar behavior.
- The bot stopped returning the questionnaire block.
- The backend response became:
  - `nextAction = ANSWER_FAQ`
  - `resolvedIntent = UNKNOWN`
  - `blocks = []`

Why the answer becomes weak:

- there is still no explicit "refused questionnaire but continue with lightweight triage" state
- the semantic layer falls back to `UNKNOWN`
- the planner falls back to `ANSWER_FAQ`
- the response becomes generic and low-commitment

So yes, your intuition is basically right:

- the problem is not "frontend forgot to continue"
- the problem is that the backend policy / Dify semantic layer has no good branch for:
  - patient refuses questionnaire
  - but still wants medical direction right now

The current system only has two stable modes here:

- `REQUEST_DOC_UPLOAD` -> show questionnaire
- `ANSWER_FAQ` -> generic lightweight answer

It does not have a good middle path.

### Issue 4

User said:

- after submitting the questionnaire, asking "你查看一下你有没有收到我填写的问题表"
- bot still says it has not received completed questionnaire

This one is real, and I reproduced it on the live stack.

#### Live reproduction

I ran this exact sequence on production:

1. create a fresh patient via `POST /api/patient/onboarding/init`
2. trigger questionnaire from widget chat
3. submit questionnaire via `POST /api/patient/intake/:caseId/response`
4. ask the widget bot whether it received the form

Result:

- questionnaire submission returned `201`
- saved response existed
- patient session API showed:
  - `medicalFormStatus = SUBMITTED`
  - `medicalFormResponseId` present
- but `GET /api/patient/me` still showed:
  - `chatbotOrchestrationState.pendingQuestion = QUESTIONNAIRE`
  - `lastNextAction = REQUEST_DOC_UPLOAD`
- then the chatbot again answered as if the form was still pending
- and again returned `Open questionnaire`

#### The key contradiction

On live production, both of these are true at the same time:

1. case-level questionnaire state is submitted
2. widget-chat orchestration state still says questionnaire pending

That is the main bug.

## Why This Should Not Happen According to Repo Code

The current repo code says questionnaire submit should clear widget state.

In [submit-patient-qc-response.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/patient-dashboard/submit-patient-qc-response.use-case.ts):

- after saving the QC response, it should:
  - create a system message:
    - `"Your medical intake form has been submitted successfully. The care team will review it shortly."`
  - call `aiChatSessionRepo.patchStatus(...)`
  - set:
    - `pendingQuestion = null`
    - `formStatus = COMPLETED`

But on live production I observed:

- no questionnaire confirmation system message in chatbot history
- `pendingQuestion` still present after submit

So the live runtime behavior does **not** match the repo behavior.

## Most Likely Root Cause for Issue 4

The strongest explanation is deployment drift.

Most likely:

- the production CRM API is running an older backend build
- that older build saves questionnaire response and case status
- but does not yet run the widget-session cleanup logic now present in this repo

Why I believe this:

1. The current repo has explicit widget cleanup logic.
2. Live production does not show the effects of that logic.
3. The missing effects are exactly the ones introduced by that logic:
   - no system confirmation message
   - no `pendingQuestion` clear
   - no `formStatus = COMPLETED` in widget orchestration state

Secondary possibility:

- production route wiring is not using `SubmitPatientQCResponseUseCase`
- or is using a stale service/container build

But deployment version mismatch is still the cleanest explanation.

## Additional Finding About Direct Dify Testing

Direct call to the live Dify app with a made-up session returned:

- `400 invalid_param`
- message about retries failing on:
  - `https://crmapi.medicaltourismchina.health/api/v2/internal/ai-policy/decide`

This looked alarming at first, but the deeper cause is simpler:

- the Dify workflow requires a valid CRM chat session
- if the session does not exist in CRM, the internal policy pipeline breaks

So the correct production probe is:

- create or use a real CRM widget session first
- then test chatbot via CRM

Not:

- call Dify app directly with an invented session id

## Final Diagnosis

### Confirmed root cause A, design bug

The system does not model questionnaire refusal as a first-class state.

Current consequence:

- if the user asks for doctor / hospital direction,
- and docs are still missing,
- the planner chooses `REQUEST_DOC_UPLOAD`,
- and CRM always turns that into `Open questionnaire`.

This is why the bot can verbally say "no need to fill now" while still showing the questionnaire CTA.

### Confirmed root cause B, production deployment bug

On live production, questionnaire submission updates the case, but does not update the widget chat session.

Current consequence:

- case says questionnaire is submitted
- widget orchestration still says questionnaire pending
- chatbot continues behaving as if submission never happened

## Recommended Fixes

### Fix 1, policy fix

Add an explicit refusal / defer-questionnaire semantic and policy path.

Suggested behavior:

- when user says they do not want to fill the questionnaire,
- do not emit `REQUEST_DOC_UPLOAD`
- do not return questionnaire block
- instead emit a lighter next action, for example:
  - `ANSWER_FAQ`
  - or a new action like `LIGHT_TRIAGE_WITHOUT_FORM`

This needs changes in:

- Dify semantic extraction examples and instructions
- AI policy intent mapping
- action planner

### Fix 2, block generation guard

Do not auto-build questionnaire block from `REQUEST_DOC_UPLOAD` if the latest user intent is explicit refusal.

Right now block generation is too mechanical.

### Fix 3, deploy the backend version that includes widget cleanup

This is urgent.

Production must include the logic from:

- [submit-patient-qc-response.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/patient-dashboard/submit-patient-qc-response.use-case.ts)

After deployment, verify these three facts immediately:

1. submit questionnaire
2. `GET /api/patient/me` shows:
   - `medicalFormStatus = SUBMITTED`
   - `chatbotOrchestrationState.pendingQuestion = null`
3. chatbot history contains the questionnaire confirmation system message

### Fix 4, regression tests

Add or extend tests for these cases:

1. user explicitly refuses questionnaire, bot must not render questionnaire block
2. user refuses questionnaire but asks for eye / department guidance, bot should still provide useful next-step guidance
3. after patient questionnaire submit, widget session must clear `pendingQuestion`
4. after submit, asking the bot whether it received the form must not return `REQUEST_DOC_UPLOAD`

## Bottom Line

The current situation is not one single bug.

It is two stacked problems:

- a policy design problem that overuses `REQUEST_DOC_UPLOAD`
- a live deployment mismatch that leaves widget questionnaire state stale after submit

The production bug is the more serious one because it breaks data truth:

- the system has the submitted questionnaire
- but the chatbot state machine still behaves as if it does not

That is why the bot feels "fake" or "not connected to real data" after form submission.
