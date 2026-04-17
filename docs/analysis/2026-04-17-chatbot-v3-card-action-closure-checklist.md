# Chatbot V3 Card Action Closure Checklist

Date: 2026-04-17
Scope: `chatbot-v3` response cards emitted by `apps/api/src/routes/chatbot-v3/response-composer.ts`
Audience: backend, frontend, QA, and follow-up planners

## Purpose

This checklist makes the current closure state explicit for every v3 card.

It answers four questions for each card:

1. Is the card currently view-only or action-bearing in live responses?
2. What backend path owns the action or revisit loop today?
3. What retry, revisit, or follow-up path already exists?
4. What is intentionally still missing?

## Current Card Matrix

| Card | Live closure today | Backend path that owns the action or revisit loop | Retry / revisit / follow-up path that exists now | Intentionally still missing |
| --- | --- | --- | --- | --- |
| `PROCESS_GUIDE` | Action-bearing | No backend call is required on click. The backend owns card emission in `composeResponse`, and the live action is `OPEN_MODAL`, which is frontend-only. | The user can revisit this card by asking another process or FAQ-style question. The backend will keep rendering the current journey card without auto-advancing the primary flow. | No backend acknowledgement, no explicit click telemetry contract, and no richer action loop beyond opening the modal. |
| `UPLOAD_RECORDS` | View-only in live responses | Record intake still flows through `POST /api/v3/chatbot/chat`, then the runtime dispatches `RecordsAgent` via `records.upload` or `records.status` depending on the turn. | The user can retry by sending another chat turn with attachments or by revisiting the upload step in chat. The backend preserves the stage and re-renders the card with updated `uploadedCount`. | The schema allows `SUBMIT` and `REFRESH_STATUS`, but the composer does not emit those actions yet. There is no explicit card-button contract for upload retry or refresh. |
| `RECOMMENDATION_LIST` | View-only in live responses | Recommendation generation and revisit flow still run through `POST /api/v3/chatbot/chat`, then `RecommendationAgent` dispatches `recommendation.generate`. | The user can ask to compare again, explain options, or revisit recommendations in chat. The backend keeps the session in `RECOMMENDATION` and re-renders the list. | The schema allows submit-style actions per hospital, but live responses do not emit them yet. There is no closed backend card action for selection, refresh, or revisit from a button click. |
| `CONSULT_BOOKING` | View-only in live responses | Consult follow-up currently runs through `POST /api/v3/chatbot/chat`, where the runtime dispatches `ConsultAgent` and reads `consult.status` for the session. | The user can revisit the consult step in chat and receive the current consult status card again. Failures stay in the same stage and now get consult-specific degraded guidance. | The schema allows `SUBMIT` and `REFRESH_STATUS`, but the composer does not emit them. There is also no live v3 card action that performs consult scheduling directly from the card surface. |
| `HANDOFF_STATUS` | View-only in live responses | Handoff creation still runs through `POST /api/v3/chatbot/chat`, where the runtime dispatches `HandoffAgent` and uses `handoff.create`. Active handoff follow-up comes from stored session state and `handoff.status`. | The user can ask for a human again or revisit the handoff state in chat. The backend keeps active handoff distinct from blocked handoff, and the card continues to reflect whether a ticket exists. | The schema allows an `OPEN_URL` action, but the composer does not emit it. There is no explicit portal/deep-link action loop yet. |

## Notes By Card

### `PROCESS_GUIDE`

This is the only v3 card that currently ships with a live action in the response envelope.

That action is intentionally frontend-owned. The backend responsibility is limited to deterministic card emission.

### `UPLOAD_RECORDS`

This card is operationally useful today even without explicit actions because the main upload path is the next chat turn with attachments.

The closure gap is not data availability. The gap is the missing explicit button-driven action contract.

### `RECOMMENDATION_LIST`

The backend already owns recommendation generation and revisit semantics, but not a closed card action loop.

That means the card is a grounded state surface, not yet a full action surface.

### `CONSULT_BOOKING`

The current v3 card reflects consult state, but it does not yet expose a live book-or-refresh action contract.

This is the clearest example of a card that is structurally present before its action surface is fully closed.

### `HANDOFF_STATUS`

The backend path for starting handoff exists and is live through the chat route.

What is still missing is the explicit post-handoff card action, such as a portal link or other follow-up affordance.

## Bottom Line

`chatbot-v3` currently has one fully action-bearing card surface and four cards that are intentionally still view-only in live responses.

That is acceptable for the current hardening batch because:

1. the backend ownership of each revisit path is now explicit
2. blocked handoff remains separate from degraded transport failures
3. the remaining action gaps are now visible enough to plan and test deliberately instead of discovering them accidentally in QA
