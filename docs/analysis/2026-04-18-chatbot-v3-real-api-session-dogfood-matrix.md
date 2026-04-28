# Chatbot V3 Real API Session Dogfood Matrix

This matrix pins the v1 scenario contract for the real API dogfood runner.

The source of truth for scenario ids, required/deferred status, quality-gate policy, and bootstrap mode selection is `scripts/chatbot-v3-real-api-dogfood/scenarios.ts`.

| Scenario | Bootstrap mode | V1 Status | Quality gate | Why | Healthy outcome level | Turn shape |
|---|---|---|---|---|---|---|
| `blocked_without_prereq` | `blocked_expected` | `required` | `required` | Canonical negative control proving chat is rejected before the patient prerequisite exists. | `blocked_correctly` | `single-turn` |
| `allowed_after_patient_session` | `chat_allowed` | `required` | `required` | Canonical allowed onboarding bootstrap proving we can establish a chat-capable patient session. | `bootstrap_success` | `single-turn` |
| `intake_to_triage_opening` | `chat_allowed` | `required` | `required` | Verifies the first allowed chat response opens the intake-to-triage path. | `opening_turn_ok` | `multi-turn` |
| `triage_to_recommendation` | `chat_allowed` | `required` | `required` | Verifies the core progression from triage into recommendation on the real API. | `triage_progression_ok` | `multi-turn` |
| `recommendation_selected_to_consult` | `chat_allowed` | `required` | `required` | Verifies the recommended-next-step flow reaches consult. | `consult_progression_ok` | `multi-turn` |
| `faq_detour_no_progression` | `chat_allowed` | `required` | `required` | Verifies a FAQ/resource detour does not silently advance the journey. | `faq_detour_no_progression_ok` | `multi-turn` |
| `handoff_denied_returns_to_current_step` | `chat_allowed` | `deferred` | `local_only` | Synthetic-only coverage for denied escalation recovery; real allowed bootstrap can create handoff tickets. | `handoff_denied_returns_current_step_ok` | `multi-turn` |
| `recommendation_to_explain` | `chat_allowed` | `deferred` | `observed` | Useful follow-up coverage after the required recommendation flow is stable. | `recommendation_explain_ok` | `multi-turn` |
| `direct_human_request_to_handoff` | `chat_allowed` | `required` | `required` | Verifies direct human escalation on the real API once the allowed patient session can create tickets. | `direct_handoff_request_ok` | `multi-turn` |
| `recommendation_revisit_compare` | `chat_allowed` | `deferred` | `observed` | Useful second-wave semantic coverage for comparing or revisiting recommendations. | `recommendation_revisit_compare_ok` | `multi-turn` |
| `repeat_explain` | `chat_allowed` | `deferred` | `observed` | Useful second-wave continuity coverage for repeated explanations. | `repeat_explain_ok` | `multi-turn` |
| `degraded_then_retry` | `chat_allowed` | `deferred` | `local_only` | Useful once baseline failure evidence exists and retry behavior needs checking. | `degraded_retry_ok` | `multi-turn` |

## v1 Coverage Notes

- The blocked-path negative control is `blocked_without_prereq`.
- The allowed onboarding bootstrap path is `allowed_after_patient_session`.
- The required v1 set is the smallest set that proves both gate behavior and the main allowed journey path.
- Deferred scenarios are intentionally held back until the first pass proves the bootstrap and journey spine are healthy.
