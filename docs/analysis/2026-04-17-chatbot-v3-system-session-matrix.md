# Chatbot V3 System Session Matrix

This matrix tracks the multi-turn public-route session scripts added in `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`.

## 1. Upload First To Recommendation

- Type: happy path
- Initial state assumptions:
  - `chatbot_v2.journey_snapshot` starts at `EXPLAIN_PROCESS`
  - `minimalTriageComplete=false`
  - `processExplained=false`
  - `recommendationGenerated=false`
- User turn sequence:
  1. `Here is my report.` with a PDF attachment
  2. `I have chest pain, it started 3 days ago, it feels moderate, and I already had a blood test.`
  3. `What should I do next?`
- Expected stage sequence:
  1. `COLLECT_MINIMAL_MEDICAL_FACTS`
  2. `COLLECT_MINIMAL_MEDICAL_FACTS`
  3. `RECOMMENDATION`
- Expected persisted truth continuity:
  - Turn 1 persists `docUploadStatus=SUBMITTED`
  - Turn 1 does not prematurely persist `minimalTriageComplete=true`
  - Turn 2 persists `minimalTriageComplete=true`
  - Turn 3 persists `recommendationGenerated=true`

## 2. Recommendation To Explain Process Before Consult

- Type: revisit path
- Initial state assumptions:
  - Journey starts at `RECOMMENDATION`
  - `minimalTriageComplete=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `processExplained=false`
  - `docUploadStatus=submitted`
- User turn sequence:
  1. `Please explain the process first.`
  2. `What should I do next?`
- Expected stage sequence:
  1. `EXPLAIN_PROCESS`
  2. `ONLINE_CONSULT`
- Expected persisted truth continuity:
  - Turn 1 persists `processExplained=true`
  - Turn 2 keeps `processExplained=true` as the session advances into consult
  - Turn 2 proves the explanation fact survives the recommendation-to-consult transition

## 3. Recommendation To Explain Process To Medical Inputs (Controlled Continuity)

- Type: controlled regression path
- Initial state assumptions:
  - Journey starts at `RECOMMENDATION`
  - `minimalTriageComplete=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `processExplained=false`
  - `docUploadStatus=submitted`
- User turn sequence:
  1. `Please explain the process first.`
  2. `I want to share more medical reports before the consultation.`
- Expected stage sequence:
  1. `EXPLAIN_PROCESS`
  2. `COLLECT_MEDICAL_INPUTS`
- Expected persisted truth continuity:
  - Turn 1 persists `processExplained=true`
  - Turn 2 keeps `processExplained=true` while entering records collection
  - Turn 2 keeps the journey in the records-collection branch instead of dropping the explanation fact
- Notes:
  - This script uses explicit supervisor/authority overrides inside the mounting harness.
  - It is intentionally **not** presented as the natural mounted fallback path today.
  - It exists to keep a targeted continuity regression around the canonical stage chain while the real mounted fallback still prefers `ONLINE_CONSULT` once `recommendationSelected=true` and `processExplained=true`.

## 4. Recommendation Selected And Explained To Online Consult

- Type: happy path
- Initial state assumptions:
  - Journey starts at `RECOMMENDATION`
  - `minimalTriageComplete=true`
  - `processExplained=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `recommendationStatus=accepted`
  - `selectedHospitalId=hospital-1`
- User turn sequence:
  1. `What should I do next?`
  2. `I am ready to schedule the consultation.`
- Expected stage sequence:
  1. `ONLINE_CONSULT`
  2. `ONLINE_CONSULT`
- Expected persisted truth continuity:
  - The session keeps `processExplained=true`
  - The session keeps `recommendationSelected=true`
  - Later turns stay in consult continuity rather than falling back to recommendation

## 5. Direct Human Request After Prerequisites

- Type: happy path
- Initial state assumptions:
  - Journey starts at `ONLINE_CONSULT`
  - `patientId` is present and `patient_session` cookie is valid
  - `minimalTriageComplete=true`
  - `processExplained=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `handoffStatus=not_needed`
- User turn sequence:
  1. `Need a human now`
  2. `Any update from the human team?`
- Expected stage sequence:
  1. `HUMAN_HANDOFF`
  2. `HUMAN_HANDOFF`
- Expected persisted truth continuity:
  - Turn 1 persists `handoffActive=true`
  - Turn 2 keeps `handoffActive=true`
  - Turn 2 does not create a duplicate ticket

## Current Observed Gap

- Under the current mounted fallback behavior, once `recommendationSelected=true` and `processExplained=true`, the public route naturally prefers `ONLINE_CONSULT`.
- That means a fully natural `COLLECT_MEDICAL_INPUTS` multi-turn continuity script is **not** claimed by this matrix yet.
- If we want that path covered as a true mounted session later, we likely need either:
  - a stronger real supervisor signal for “keep collecting records before consult”, or
  - an explicit product/runtime decision that the system should still prefer records collection in that state for certain user intents.
