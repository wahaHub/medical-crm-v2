## Chatbot V2 Live Session Analysis Report

Date: 2026-04-12

### Scope

This round focused on three goals:

1. Verify the current live `chatbot-v2` flow after redeploying CRM v2 and the latest composer DSL.
2. Cover the main business cases, not only the `progression 502` problem.
3. Narrow the root cause of intermittent `progression 502` failures with live evidence from CRM and Dify.

### Deployment Baseline

- CRM API was redeployed from the latest local `chatbot-v2` code.
- Composer DSL was republished with composer app key `app-oVCgMomvUBR9VEac3hKq3Rie`.
- Classifier app key remained `app-wArLT3lvOs4HX4BXfXpE2nTp`.
- FAQ grounding app key remained `app-XypTX7zJIPHE65KMQ9EYkIXv`.

### Test Method

I used three kinds of evidence:

1. Real live CRM API probes against `https://crmapi.medicaltourismchina.health`
2. Real CRM server logs from `medora-crm-v2-api`
3. Real Dify container logs from `/opt/medora/dify/docker`

### What Was Confirmed

#### 1. Questionnaire receipt is working

In the earlier live probe for this deployment line:

- opening the questionnaire returned a `QUESTIONNAIRE` resource
- submitting the questionnaire through `/api/patient/intake/:caseId/response` succeeded
- `/api/patient/me` then returned `medicalFormStatus = SUBMITTED`
- asking `Have you received my questionnaire?` returned a correct acknowledgment

This means the receipt path is now reading truth correctly.

#### 2. Recommendation progression after submission can work

In the same live probe:

- after questionnaire submission, asking `Can we move to recommendations now?` returned `200`
- the journey moved into recommendation
- recommendation resources were returned

So the collect-to-recommendation path is not fundamentally broken.

#### 3. The current live `progression 502` is not a generic CRM route failure

From CRM journal logs:

- successful requests usually show internal writeback:
  - `POST /api/v2/internal/ai-policy/writeback 200`
- failing `502` progression-style requests do not always reach a successful writeback

This means the failure is not just "chat answer saved incorrectly after success". It happens earlier in the upstream Dify execution path.

### New Hard Evidence For The 502 Root Cause

The strongest new evidence came from live Dify logs.

Repeated Dify API log entries showed:

```text
Unsupported parameter: 'max_tokens' is not supported with this model.
Use 'max_completion_tokens' instead.
```

The corresponding Dify exception was:

```text
InvokeBadRequestError
[models] Bad Request Error, Error code: 400
```

This error appeared repeatedly during live runs in the Dify API container while the chatbot flow was executing LLM nodes.

### Root Cause Assessment For `progression 502`

Current best assessment:

1. The intermittent `progression 502` is very likely caused by a Dify model invocation compatibility issue, not by CRM request validation.
2. One or more executed LLM nodes are still invoking the provider with `max_tokens`.
3. The current model behind that node requires `max_completion_tokens` instead.
4. Because not every turn hits the same node path, the failure appears intermittent.

In plain language:

- some progression-family turns take a Dify path that hits an incompatible model invocation
- some turns avoid that path and succeed
- that is why `What information do you need next?` can succeed once and another progression-style sentence can still fail

### Why Session Automation Was Partially Blocked

Fresh-session automation hit the production onboarding limiter.

Live behavior observed:

- `POST /api/patient/onboarding/init` eventually returned `429 Too many requests`
- once onboarding failed, downstream chat calls failed with `sessionId = null`

This was not a chatbot logic failure. It was a production test-environment constraint.

The limiter in code is:

- production onboarding rate limit: `20 / hour`

File:

- [patient-public.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-public.routes.ts)

### Coverage Status By Case

#### Covered with live evidence

- FAQ entry and process explanation
- questionnaire open path
- questionnaire submit path
- questionnaire receipt acknowledgment
- move to recommendation after submission
- intermittent progression failures
- Dify-side failure evidence for progression 502

#### Not fully revalidated in this round

- full handoff lifecycle on the latest deployment
- no-rewind guarantee after handoff
- full online consult required / cannot-dismiss behavior

These were not skipped intentionally. They were blocked by the onboarding rate limiter once repeated fresh-session generation started failing.

### Current Product-Level Readout

#### Passing

- questionnaire receipt truth
- recommendation can start after submitted inputs
- CRM + classifier + composer chain is alive on production

#### Still failing or not yet fully closed

- intermittent `progression 502`
- full handoff regression verification on the latest deploy
- full multi-session automated regression on production due onboarding rate limit

### Recommended Next Step

Before more live session testing, fix the Dify model compatibility issue first.

Most likely fix direction:

1. identify which Dify app/node still invokes a model with `max_tokens`
2. switch that node to a compatible model configuration or provider setting
3. republish the affected DSL
4. rerun the same progression-family probes

After that, run another live session round for:

- progression-family phrases
- handoff lifecycle
- online consult required / cannot-dismiss copy

