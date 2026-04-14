# Chatbot V3 M0 Observability Checklist

Date: 2026-04-15
Environment: Non-prod only
Scope: `chatbot-v3` M0 events, metric windows, and alert simulations

## Preconditions

- Use a non-production API environment with `chatbot-v3` enabled.
- Capture structured logs where emitted event objects can be inspected.
- Capture metric snapshots or expose a local debug hook for metric-window inputs.
- Use test sessions with synthetic IDs so no patient data is logged.

## Event Verification

### Correlation IDs

- Trigger one supervisor-only turn and confirm every emitted event includes:
  - `traceId`
  - `sessionId`
  - `turnId`
  - `childRunId`
- Confirm `childRunId` is `null` before a sub-agent is dispatched and populated after dispatch.

### Required event names

- Verify `supervisor_suggestion_created` appears after supervisor suggestion generation.
- Verify `orchestrator_decision_finalized` appears after orchestrator decision evaluation.
- Verify `journey_transition_committed` appears when the journey stage changes.
- Verify the following sub-agent lifecycle events can all be observed through controlled simulations:
  - `subagent_dispatched`
  - `subagent_started`
  - `subagent_completed`
  - `subagent_failed`
  - `subagent_timeout`
  - `subagent_cancelled`
- Verify the following tool lifecycle events can all be observed through controlled simulations:
  - `tool_call_started`
  - `tool_call_completed`
  - `tool_call_failed`

### Decision-event fields

- On `orchestrator_decision_finalized`, confirm the event includes:
  - `suggestedStage`
  - `finalStage`
  - `decisionType`
  - `matchedRuleId`
  - `reason`
- Force a `STAY` decision through an explain-gate or prerequisite denial and confirm `whyNotSkip` is present.

### Redaction and truncation

- Emit a synthetic long `reason` value (> 240 chars) and confirm the stored field is capped at 240 chars.
- Emit a synthetic long `errorDetail` value (> 512 chars) and confirm the stored field is capped at 512 chars.
- Include token-like content such as `password=secret123` or `token=abc123` in synthetic error details and confirm the stored output is redacted.
- Confirm no raw medical-record payloads or attachment content are present in logs.

## Metric Verification

### Tool counters

- Record at least 20 synthetic `consult.schedule` calls in a 5-minute window.
- Record at least 20 synthetic `recommendation.generate` calls in a 5-minute window.
- Confirm totals and failure counts are available for both tool names.

### Sub-agent counters

- Confirm 10-minute window captures:
  - total sub-agent executions
  - timeout count
- Confirm timeout ratio can be derived from the same window.

### Handoff counters

- Confirm 30-minute window captures total turns and handoff turns.
- Confirm trailing 7-day baseline handoff rate is available for comparison.

## Alert Simulations

### `consult.schedule_failure_rate`

- Simulate 20 `consult.schedule` calls in 5 minutes with 4 failures.
- Expected result: alert fires because failure rate is 20%, which is greater than 15%, and minimum-call threshold is satisfied.
- Negative check: repeat with 19 calls or with 3 failures out of 20 and confirm no alert fires.

### `recommendation.generate_failure_rate`

- Simulate 20 `recommendation.generate` calls in 5 minutes with 5 failures.
- Expected result: alert fires because failure rate is 25%, which is greater than 20%, and minimum-call threshold is satisfied.
- Negative check: repeat with 4 failures out of 20 and confirm no alert fires.

### `subagent_timeout_rate`

- Simulate 10-minute window with 11 timeouts.
- Expected result: alert fires because timeout count is greater than 10.
- Simulate 10-minute window with 9 timeouts out of 100 total sub-agent runs.
- Expected result: alert fires because timeout ratio is 9%, which is greater than 8%.
- Negative check: simulate 8 timeouts out of 100 and confirm no alert fires.

### `handoff_rate_spike`

- Simulate 30-minute window with 36 handoffs out of 100 turns and trailing 7-day baseline of 17%.
- Expected result: alert fires because 36% is greater than 35% and also greater than 2x baseline (34%).
- Negative check: simulate 36% handoff rate with 20% baseline and confirm no alert fires because the 2x baseline condition is not met.

## Sign-off

- Record log samples for each required event name.
- Record metric snapshots used for each alert simulation.
- Confirm all negative checks remain quiet.
- Save verification artifacts with timestamps and the non-prod environment name.
