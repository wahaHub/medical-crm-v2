# Chatbot V3 Medical Advice Event and Skill Design

Date: 2026-04-29
Branch: feature/phase-2bc

## Context

Natural-session dogfood for batch 01 showed that many medically relevant but supportable patient questions were being routed through a blanket safety redirect. Examples included asking which specialty to see, whether symptoms sound urgent, whether to book a test, and how to understand warning signs. These are medical-advice domain questions, but they are not all the same risk class.

The current event name `USER_ASKED_RISKY_MEDICAL_ADVICE` makes the supervisor decide both domain and risk. That collapses too much policy into event extraction and causes broad redirects before the skill layer can distinguish safe guidance from prohibited advice.

## Decision

Rename the semantic event to:

`USER_ASKED_MEDICAL_ADVICE`

The event means: the user is asking for medically relevant judgment, guidance, interpretation, triage, specialty routing, medication, treatment, urgency, prognosis, or outcome information.

It does not mean the system must refuse. Risk handling belongs in the medical advice / safety skill and response policy.

Medical-advice and out-of-scope detection should not be duplicated as local regex heuristics. The supervisor prompt and semantic gateway own these classifications so the model can use conversation context and distinguish the subtype before the skill applies policy.

## Medical Advice Skill Behavior

Medical advice handling should separate subtypes:

- `triage_or_urgency_question`: provide safety boundaries and red-flag guidance, recommend local urgent care when symptoms may be urgent, then preserve the Medora journey.
- `specialty_or_department_question`: do not diagnose, but help route toward appropriate doctor/hospital review based on records and symptoms.
- `diagnosis_uncertainty_question`: avoid definitive diagnosis, explain that doctors need records/exam, and ask for useful records or facts.
- `medication_or_prescription_question`: do not provide medication choice, dosing, start/stop/change instructions, or prescription promises.
- `treatment_decision_question`: do not choose treatment for the patient, but support second opinion and records-based review.
- `outcome_guarantee_request`: clearly decline guarantees or promises of cure, survival, success, recovery, timing, or recurrence.

The response shape should be: boundary, useful safe guidance, next Medora step. It should not default to a generic refusal unless the subtype requires it.

## Out Of Scope

Do not change language selection behavior in this slice. The system should continue using the user's selected language source.

Do not build or seed the FAQ library in this slice. FAQ/process/pricing fallback remains a separate content/retrieval problem.

Do not change the journey authority model.

## Observability

Runtime debug should expose the real supervisor event evidence, not only skill behavior fallback hints:

- `event.eventType`
- `event.target`
- `event.modifier`
- `event.source`
- `event.confidence`
- `event.metadata`

For medical advice events, debug should also expose enough policy evidence to distinguish safe guidance from restricted advice handling.

## Acceptance Criteria

- Supervisor event types and prompts use `USER_ASKED_MEDICAL_ADVICE`, not `USER_ASKED_RISKY_MEDICAL_ADVICE`.
- Specialty, department, urgency, diagnosis uncertainty, medication, treatment-decision, and guarantee examples all classify as medical advice where appropriate.
- Medication/treatment/outcome guarantee cases still avoid unsafe advice.
- Specialty and urgency cases do not receive the blanket generic safety redirect unless the policy subtype requires urgent local care.
- Local deterministic extraction does not short-circuit medical advice or out-of-scope service requests with regex; it can still short-circuit explicit human requests and attachments.
- Runtime debug includes the real supervisor event so dogfood artifacts no longer have to infer event type from `skillBehaviorChecks.sectionHint`.
