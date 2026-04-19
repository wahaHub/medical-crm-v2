import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAllowedOnboardingPayload } from '../chatbot-v3-real-api-dogfood.ts';

test('allowed-path onboarding payload email is unique per scenario within a run', () => {
  const first = buildAllowedOnboardingPayload({
    site: 'beauty',
    scenarioId: 'allowed_after_patient_session',
    runTimestamp: '2026-04-18T14-05-09Z',
  });
  const second = buildAllowedOnboardingPayload({
    site: 'beauty',
    scenarioId: 'intake_to_triage_opening',
    runTimestamp: '2026-04-18T14-05-09Z',
  });

  assert.notEqual(first.email, second.email);
  assert.match(first.email, /allowed-after-patient-session/i);
  assert.match(second.email, /intake-to-triage-opening/i);
});

test('allowed-path onboarding payload email changes across runs for the same scenario', () => {
  const earlier = buildAllowedOnboardingPayload({
    site: 'beauty',
    scenarioId: 'allowed_after_patient_session',
    runTimestamp: '2026-04-18T14-05-09Z',
  });
  const later = buildAllowedOnboardingPayload({
    site: 'beauty',
    scenarioId: 'allowed_after_patient_session',
    runTimestamp: '2026-04-18T14-06-10Z',
  });

  assert.notEqual(earlier.email, later.email);
  assert.ok(earlier.email.endsWith('@example.com'));
  assert.ok(later.email.endsWith('@example.com'));
});
