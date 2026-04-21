# 2026-04-21 Chatbot V3 Supporting-Documents Stall Bug Note

## Symptom
In the selected recommendation path:
- user reaches `COLLECT_MEDICAL_INPUTS`
- uploads a diagnosis/supporting document successfully
- next turn still says `Please upload your diagnosis proof...`
- repeated uploads do not increase `uploadedCount` beyond `1`

## Confirmed Live Behavior
Observed in live sessions on `https://crmapi.medicaltourismchina.health`:
- first upload is accepted
- journey remains `COLLECT_MEDICAL_INPUTS`
- follow-up turn still renders diagnosis-proof upload guidance
- second upload is accepted but card `uploadedCount` remains `1`

## Root Cause
This is two issues layered together.

### 1. `uploadedCount` is reading the wrong source of truth
`UPLOAD_RECORDS.payload.uploadedCount` is currently derived from:
- current-turn `attachments.length`
- legacy `docUploadStatus`

It does **not** derive from `statusSnapshot.supportingDocuments.length`.

Result:
- second supporting document upload still renders `uploadedCount = 1`

## Evidence
- `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/response-composer.ts`
- `readUploadedCount(...)`

### 2. Live supervisor prompt is missing structured journey state needed to advance past `COLLECT_MEDICAL_INPUTS`
The deterministic fallback heuristic in `SupervisorService` already says:
- if `recommendationSelectionStatus === 'selected'`
- and `process.explained === true`
- and `supportingDocuments.length > 0`
- then suggest `ONLINE_CONSULT`

But the live supervisor gateway prompt does not explicitly provide these structured fields to the LLM.

Current prompt includes only:
- `current_stage`
- `conversation_summary`
- `latest_user_message`
- intake seed facts

It does **not** explicitly include:
- `recommendationSelectionStatus`
- `process.explained`
- `supportingDocuments`
- `supportingDocuments.length`

Result:
- live LLM supervisor can keep suggesting `COLLECT_MEDICAL_INPUTS`
- response composer then keeps rendering upload guidance because authoritative journey still stays in `COLLECT_MEDICAL_INPUTS`

## Evidence
- `/Users/haowang/Desktop/claws/medical-crm-v2/packages/application/src/services/chatbot-v3/supervisor.service.ts`
- `/Users/haowang/Desktop/claws/medical-crm-v2/apps/api/src/routes/chatbot-v3/supervisor-prompt.ts`

## Important Non-Bugs
These are **not** the root cause:
- upload turn itself being rejected
- supporting documents failing to persist at all
- route falling back to old attachment bootstrap override

Supporting documents are already appended on upload turns.

## Expected Fix Direction
1. Make `uploadedCount` read from `supportingDocuments.length` for `COLLECT_MEDICAL_INPUTS`
2. Thread structured post-recommendation/supporting-document state explicitly into the live supervisor prompt/context
3. Add regression coverage for:
   - first upload
   - second upload / re-entry upload
   - selected + explained + supportingDocuments > 0 => progression beyond `COLLECT_MEDICAL_INPUTS`
