# Chatbot V3 System Session Full Transcript Record

This file lists the current supervisor-led `chatbot-v3` system-session scripts turn by turn.

Source of truth for this record:
- mounted public-route session tests in `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
- fixed route/composer text in `apps/api/src/routes/chatbot-v3/response-composer.ts`
- fixed Records/Recommendation fallback text in `records-prompts.ts`, `records-llm-adapter.ts`, and `recommendation-prompts.ts`

Notes:
- `Mounted` means the session follows the public route's natural current behavior.
- `Controlled` means the test intentionally uses supervisor/authority overrides to lock a specific continuity path.
- Text below is written as the current full session record for review. Fixed route text is exact. Recommendation cards and persisted truth are included so the conversation can be read together with the system state.

## Session 1: Upload First -> Minimal Triage -> Recommendation

- Type: Mounted
- Initial state:
  - journey snapshot: `EXPLAIN_PROCESS / active`
  - `minimalTriageComplete=false`
  - `processExplained=false`
  - `recommendationGenerated=false`

### Turn 1
- User:
  - `Here is my report.`
  - attachment: `report.pdf`
- Assistant:
  ```text
  Please answer these 3 questions so I can capture the essential medical details.
  1. What is the main symptom, diagnosis, or medical problem right now?
  2. When did it start, how long has it been going on, and how severe is it?
  3. What tests, treatments, medicines, or diagnoses already exist?
  ```
- Journey:
  - stage: `COLLECT_MINIMAL_MEDICAL_FACTS`
  - phase: `active`
- Cards:
  - `UPLOAD_RECORDS` with `uploadedCount=1`
- Persisted continuity after turn:
  - `docUploadStatus=SUBMITTED`
  - `minimalTriageComplete` remains `false`

### Turn 2
- User:
  - `I have chest pain, it started 3 days ago, it feels moderate, and I already had a blood test.`
- Assistant:
  ```text
  Please share the key medical facts and any records you already have so I can guide the next step.
  ```
- Journey:
  - stage: `COLLECT_MINIMAL_MEDICAL_FACTS`
  - phase: `active`
- Cards:
  - `UPLOAD_RECORDS`
- Persisted continuity after turn:
  - `minimalTriageComplete=true`

### Turn 3
- User:
  - `What should I do next?`
- Assistant:
  ```text
  I checked the recommendation stage for this session.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`
  - candidates:
    - `Shanghai Chest Hospital` — `Active hospital candidate with thoracic oncology.`
    - `Fudan Cancer Center` — `Active hospital candidate with multidisciplinary oncology.`
    - `Ruijin Hospital` — `Active hospital candidate with broad oncology.`
- Persisted continuity after turn:
  - `recommendationGenerated=true`

## Session 2: Recommendation -> Explain Process -> Consult Continuity

- Type: Mounted
- Initial state:
  - journey snapshot: `RECOMMENDATION / active`
  - `minimalTriageComplete=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `processExplained=false`
  - `docUploadStatus=submitted`

### Turn 1
- User:
  - `Please explain the process first.`
- Assistant:
  ```text
  Here is the process: first, share your medical records, then review hospital recommendations, and finally arrange an online consultation if you want one.
  ```
- Journey:
  - stage: `EXPLAIN_PROCESS`
  - phase: `active`
- Cards:
  - `PROCESS_GUIDE`
- Persisted continuity after turn:
  - `processExplained=true`

### Turn 2
- User:
  - `What should I do next?`
- Assistant:
  ```text
  I checked the online consultation stage for this session.
  ```
- Journey:
  - stage: `ONLINE_CONSULT`
  - phase: `active`
- Cards:
  - `CONSULT_BOOKING` with `status=idle`
- Persisted continuity after turn:
  - `processExplained=true`

## Session 3: Recommendation -> Explain Process -> Medical Inputs

- Type: Controlled
- Why controlled:
  - this keeps the canonical continuity regression for `RECOMMENDATION -> EXPLAIN_PROCESS -> COLLECT_MEDICAL_INPUTS`
  - the current natural mounted fallback still prefers `ONLINE_CONSULT` once `recommendationSelected=true` and `processExplained=true`
- Initial state:
  - journey snapshot: `RECOMMENDATION / active`
  - `minimalTriageComplete=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `processExplained=false`
  - `docUploadStatus=submitted`

### Turn 1
- User:
  - `Please explain the process first.`
- Assistant:
  ```text
  Here is the process: first, share your medical records, then review hospital recommendations, and finally arrange an online consultation if you want one.
  ```
- Journey:
  - stage: `EXPLAIN_PROCESS`
  - phase: `active`
- Cards:
  - `PROCESS_GUIDE`
- Persisted continuity after turn:
  - `processExplained=true`

### Turn 2
- User:
  - `I want to share more medical reports before the consultation.`
- Assistant:
  ```text
  Please upload or share any pathology reports, imaging, blood tests, discharge summaries, medication lists, or treatment history you already have.
  ```
- Journey:
  - stage: `COLLECT_MEDICAL_INPUTS`
  - phase: `active`
- Cards:
  - `UPLOAD_RECORDS`
- Persisted continuity after turn:
  - `processExplained=true`

## Session 4: Recommendation Selected + Explained -> Online Consult Continuity

- Type: Mounted
- Initial state:
  - journey snapshot: `RECOMMENDATION / active`
  - `minimalTriageComplete=true`
  - `processExplained=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `recommendationStatus=accepted`
  - `selectedHospitalId=hospital-1`

### Turn 1
- User:
  - `What should I do next?`
- Assistant:
  ```text
  I checked the online consultation stage for this session.
  ```
- Journey:
  - stage: `ONLINE_CONSULT`
  - phase: `active`
- Cards:
  - `CONSULT_BOOKING` with `status=idle`

### Turn 2
- User:
  - `I am ready to schedule the consultation.`
- Assistant:
  ```text
  I checked the online consultation stage for this session.
  ```
- Journey:
  - stage: `ONLINE_CONSULT`
  - phase: `active`
- Cards:
  - `CONSULT_BOOKING` with `status=idle`
- Persisted continuity after turn:
  - `processExplained=true`
  - `recommendationSelected=true`

## Session 5: Direct Human Request -> Handoff Continuity

- Type: Mounted
- Initial state:
  - journey snapshot: `ONLINE_CONSULT / active`
  - `patientId=patient-1`
  - valid `patient_session` cookie present
  - `minimalTriageComplete=true`
  - `processExplained=true`
  - `recommendationGenerated=true`
  - `recommendationSelected=true`
  - `handoffStatus=not_needed`

### Turn 1
- User:
  - `Need a human now`
- Assistant:
  ```text
  This session is currently in human handoff.
  ```
- Journey:
  - stage: `HUMAN_HANDOFF`
  - phase: `active`
- Cards:
  - `HANDOFF_STATUS` with `required=true` and `ticketId=ticket-v3-1`
- Persisted continuity after turn:
  - `handoffActive=true`
  - ticket created once

### Turn 2
- User:
  - `Any update from the human team?`
- Assistant:
  ```text
  This session is currently in human handoff.
  ```
- Journey:
  - stage: `HUMAN_HANDOFF`
  - phase: `active`
- Cards:
  - `HANDOFF_STATUS` with `required=true` and `ticketId=ticket-v3-1`
- Persisted continuity after turn:
  - `handoffActive=true`
  - no duplicate ticket

## Session 6: FAQ Detour That Does Not Auto-Advance Main Journey

- Type: Controlled
- Why controlled:
  - the test pins FAQ intent and keeps the journey on `RECOMMENDATION` to prove non-progressing detour behavior explicitly
- Initial state:
  - journey snapshot: `RECOMMENDATION / active`
  - `minimalTriageComplete=true`
  - `recommendationGenerated=true`
  - `processExplained=false`

### Turn 1
- User:
  - `How long does online consultation usually take to schedule?`
- Assistant:
  ```text
  Online consultations are usually arranged within 24 hours.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`
- Persisted continuity after turn:
  - `recommendationGenerated=true`
  - `processExplained=false`

### Turn 2
- User:
  - `Show me the hospital options again.`
- Assistant:
  ```text
  I checked the recommendation stage for this session.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`
- Persisted continuity after turn:
  - journey does not auto-advance because of the FAQ detour

## Session 7: Recommendation Revisit / Compare Loop

- Type: Mounted
- Initial state:
  - journey snapshot: `RECOMMENDATION / active`
  - `minimalTriageComplete=true`
  - `recommendationGenerated=true`
  - `processExplained=false`

### Turn 1
- User:
  - `Compare the hospitals for me.`
- Assistant:
  ```text
  These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`

### Turn 2
- User:
  - `Compare them again and explain the differences.`
- Assistant:
  ```text
  These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`

### Turn 3
- User:
  - `Show me the hospital options again.`
- Assistant:
  ```text
  I checked the recommendation stage for this session.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`
- Persisted continuity after turn:
  - `recommendationGenerated=true`

## Session 8: Repeat Explain On Already-Explained Path

- Type: Mounted
- Initial state:
  - journey snapshot: `RECOMMENDATION / active`
  - `minimalTriageComplete=true`
  - `processExplained=true`
  - `recommendationGenerated=true`

### Turn 1
- User:
  - `Please explain the process again.`
- Assistant:
  ```text
  I checked the recommendation stage for this session.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`
- Persisted continuity after turn:
  - `processExplained=true`

### Turn 2
- User:
  - `What should I do next?`
- Assistant:
  ```text
  I checked the recommendation stage for this session.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Cards:
  - `RECOMMENDATION_LIST`
- Persisted continuity after turn:
  - `processExplained=true`

## Session 9: Degraded Recommendation -> Later Retry Recovery

- Type: Controlled
- Why controlled:
  - the test injects one recommendation timeout and then a later successful retry to prove recoverability cleanly
- Initial state:
  - journey snapshot: `RECOMMENDATION / active`
  - `minimalTriageComplete=true`
  - `recommendationGenerated=true`

### Turn 1
- User:
  - `Show me more hospitals.`
- Assistant:
  ```text
  I could not refresh the hospital recommendations just now, but your current stage is still saved. Please try again in this chat.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Turn outcome:
  - `degraded`
- Cards:
  - `RECOMMENDATION_LIST`
- Persisted continuity after turn:
  - `recommendationGenerated=true`

### Turn 2
- User:
  - `Try the recommendations again.`
- Assistant:
  ```text
  I checked the recommendation stage for this session.
  ```
- Journey:
  - stage: `RECOMMENDATION`
  - phase: `active`
- Turn outcome:
  - `ok`
- Cards:
  - `RECOMMENDATION_LIST`
  - candidates include:
    - `Shanghai Chest Hospital`
    - `Fudan Cancer Center`
- Persisted continuity after turn:
  - session recovers without losing recommendation state

## Session 10: Denied Handoff Detour -> Return To Current Records Step

- Type: Controlled
- Why controlled:
  - the test pins a handoff request that must be denied and then confirms the next turn returns to `COLLECT_MEDICAL_INPUTS` without polluting handoff truth
- Initial state:
  - journey snapshot: `COLLECT_MEDICAL_INPUTS / active`
  - `minimalTriageComplete=true`
  - `processExplained=true`
  - `recommendationGenerated=true`
  - `handoffStatus=not_needed`
  - `docUploadStatus=none`

### Turn 1
- User:
  - `Can I talk to a human now?`
- Assistant:
  ```text
  Before we connect you with a human, please complete the current step first.
  ```
- Journey:
  - stage: `COLLECT_MEDICAL_INPUTS`
  - phase: `active`
- Turn outcome:
  - `ok`
- Cards:
  - `UPLOAD_RECORDS`
- Persisted continuity after turn:
  - `handoffStatus=not_needed`
  - `handoffActive` does not become `true`

### Turn 2
- User:
  - `What should I send next?`
- Assistant:
  ```text
  Please upload or share any pathology reports, imaging, blood tests, discharge summaries, medication lists, or treatment history you already have.
  ```
- Journey:
  - stage: `COLLECT_MEDICAL_INPUTS`
  - phase: `active`
- Cards:
  - `UPLOAD_RECORDS`
- Persisted continuity after turn:
  - still `handoffStatus=not_needed`
  - still no active handoff truth

## Short Readout

What this file shows in one place:
- the exact user prompts used by the current system-session suite
- the current assistant reply text expected from mounted or controlled sessions
- where the system is staying on the same stage versus progressing
- which paths are natural mounted behavior versus controlled continuity/recovery coverage

Known honesty note:
- The only stage-chain path intentionally preserved as controlled rather than natural-mounted is:
  - `RECOMMENDATION -> EXPLAIN_PROCESS -> COLLECT_MEDICAL_INPUTS`
- The current natural mounted behavior still tends to prefer `ONLINE_CONSULT` after `recommendationSelected=true` and `processExplained=true`.
