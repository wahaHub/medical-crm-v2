# Progression 502 Node Trace

Date: 2026-04-12

## Goal

Find the easiest live `progression 502` repro, identify the exact user sentence that fails, and inspect the Dify workflow run plus every executed node for that sentence.

## Repro Method

- Avoided public onboarding rate limits by creating a fresh guest patient/session from the CRM server itself via `http://127.0.0.1:3001`.
- Reused the returned `patient_session` cookie to chat against the real production API process.
- Sent a short three-turn session one message at a time so each turn had a clean timestamp.

Fresh session:

- `patientId`: `35e9357f-06b1-4391-b75b-88800792973e`
- `caseId`: `aac8fa60-8d8e-4d52-95c0-419bdfae147f`
- `sessionId`: `widget-chat:35e9357f-06b1-4391-b75b-88800792973e:aac8fa60-8d8e-4d52-95c0-419bdfae147f`

## Minimal Repro Session

### Turn 1

- Timestamp: `2026-04-12T10:25:18Z`
- User: `I want to come to China for treatment. What services do you provide?`
- CRM result: `200`
- Outcome: `COLLECT_MEDICAL_INPUTS.pre`

### Turn 2

- Timestamp: `2026-04-12T10:25:31Z`
- User: `How does your process work?`
- CRM result: `200`
- Outcome: still `COLLECT_MEDICAL_INPUTS.pre`

### Turn 3

- Timestamp: `2026-04-12T10:25:45Z`
- User: `If this makes sense, we can continue.`
- CRM result: `502`
- Public error: `{"error":"Invalid classifier result payload"}`

This is the cleanest current repro.

## CRM Timeline

From `journalctl -u medora-crm-v2-api`:

- `10:25:45` previous successful turn returned `200`
- `10:25:45` failing `POST /api/v2/chatbot/chat` began
- `10:25:54` failing `POST /api/v2/chatbot/chat` returned `502`

No composer writeback happened for the failing turn. That means the request failed before the composer/writeback leg.

## Dify Workflow Run For The Failing Turn

Matching Dify workflow run in Postgres:

- `workflow_run_id`: `0d2cc55a-12b3-40d7-a073-68aed44ddf66`
- app: `Medora AI Chatbot v2 Classifier`
- status: `succeeded`
- created_at: `2026-04-12 10:25:45.826849`
- finished_at: `2026-04-12 10:25:54.393042`

Top-level workflow output:

```json
{
  "answer": "{\"requestClass\":\"progression_request\",\"targetResourceTypes\":[\"MEDICAL_DOC_UPLOAD\", \"QUESTIONNAIRE\"],\"includeProgressionFollowUp\":false}\n",
  "files": []
}
```

## Node-by-Node Trace For The Failing Turn

### Node 1: `start`

- status: `succeeded`
- important input: recent conversation context plus the latest user message

### Node 2: `classifier_llm`

- status: `succeeded`
- raw model text:

```json
{
  "requestClass": "progression_request",
  "targetResourceTypes": ["MEDICAL_DOC_UPLOAD", "QUESTIONNAIRE"],
  "includeProgressionFollowUp": false
}
```

### Node 3: `normalize_classifier_output`

- status: `succeeded`
- normalized outputs:

```json
{
  "request_class": "progression_request",
  "target_resource_types": "[\"MEDICAL_DOC_UPLOAD\", \"QUESTIONNAIRE\"]",
  "include_progression_follow_up": "false"
}
```

### Node 4: `final_answer`

- status: `succeeded`
- final returned answer:

```json
{
  "requestClass": "progression_request",
  "targetResourceTypes": ["MEDICAL_DOC_UPLOAD", "QUESTIONNAIRE"],
  "includeProgressionFollowUp": false
}
```

## Confirming It Is Not A One-Off

Another progression-family sentence produced the same failure shape.

### Second Repro

- Timestamp: `2026-04-12T10:28:01Z`
- User: `Okay, then what information do you need next?`
- CRM result: `502`
- Public error: `{"error":"Invalid classifier result payload"}`

Matching classifier workflow run:

- `workflow_run_id`: `9053d316-8543-4526-8a26-492b0db27171`

Its node outputs again showed:

```json
{
  "requestClass": "progression_request",
  "targetResourceTypes": ["QUESTIONNAIRE", "MEDICAL_DOC_UPLOAD"],
  "includeProgressionFollowUp": false
}
```

## Root Cause Under The Old Contract

The failure is not a generic Dify outage and not a composer failure.

The reproducible `progression 502` root cause under the old classifier contract was:

1. The classifier workflow returned `requestClass = progression_request`.
2. It also returned non-empty `targetResourceTypes`.
3. CRM validated the classifier result against `ChatbotV2ClassifierResultSchema`.
4. The old schema explicitly forbade `progression_request` from carrying `targetResourceTypes`.
5. CRM therefore threw `Invalid classifier result payload`.

Relevant schema rule:

- [chat-journey.schema.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts#L143)

The old rule said:

- `progression_request must not target concrete resources`

Relevant classifier DSL normalization code:

- [medora-ai-chatbot-v2-classifier.dsl.yml](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/dify-config/medora-ai-chatbot-v2-classifier.dsl.yml#L241)

The classifier normalize step filtered resource types against the allowed list, but it did not clear them when `requestClass = progression_request`.

## Important Clarification About The Earlier `max_tokens` Evidence

Earlier Dify logs did show runtime/provider errors involving `max_tokens`.

However, for the easiest current live repro documented here, the failure happens earlier and more specifically:

- classifier run succeeds
- CRM rejects the returned classifier payload shape

So this reproducible `progression 502` is currently explained by a classifier contract mismatch, not by a GPT-5 provider invocation failure.

That means the `max_tokens` evidence may still describe a separate intermittent issue, but it is not needed to explain this cleanest current repro.

## Follow-Up

After this trace, the contract decision changed:

- `progression_request` is now allowed to carry `targetResourceTypes`
- in that class, the array means candidate next-step resources, not explicitly requested resources

So this document should now be read as:

- a precise trace of the old failure mode
- not as the desired final contract

The next verification step is to rerun the exact same session after redeploying the updated classifier contract:

1. `I want to come to China for treatment. What services do you provide?`
2. `How does your process work?`
3. `If this makes sense, we can continue.`

If that passes, retest the sibling phrase:

4. `Okay, then what information do you need next?`
