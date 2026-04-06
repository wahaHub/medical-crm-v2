import { describe, expect, it } from 'vitest';

import {
  collectQuoteRequestTargets,
  deriveSelectedHospitals,
  type HospitalContactLike,
} from '../lib/case-selected-hospitals';

function contactFixture(overrides: Partial<HospitalContactLike>): HospitalContactLike {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    hospitalId: overrides.hospitalId ?? 'hospital-1',
    hospitalName: overrides.hospitalName,
    subStatus: overrides.subStatus ?? 'DISTRIBUTED',
    selectedByPatientAt: 'selectedByPatientAt' in overrides ? overrides.selectedByPatientAt ?? null : '2026-04-03T10:00:00.000Z',
    distributedAt: 'distributedAt' in overrides ? overrides.distributedAt ?? null : '2026-04-03T10:00:00.000Z',
    quoteId: overrides.quoteId ?? null,
    patientAcceptedAt: overrides.patientAcceptedAt ?? null,
    patientRejectedAt: overrides.patientRejectedAt ?? null,
    reminderSentAt: overrides.reminderSentAt ?? null,
    removedAt: overrides.removedAt ?? null,
  };
}

describe('deriveSelectedHospitals', () => {
  it('keeps only patient-selected hospitals and derives overview statuses', () => {
    const hospitals = deriveSelectedHospitals(
      [
        contactFixture({ id: 'contact-selected', hospitalId: 'hospital-1' }),
        contactFixture({ id: 'contact-requested', hospitalId: 'hospital-2', reminderSentAt: '2026-04-03T11:00:00.000Z' }),
        contactFixture({ id: 'contact-quoted', hospitalId: 'hospital-3', subStatus: 'QUOTED', quoteId: 'quote-1' }),
        contactFixture({ id: 'contact-added-by-admin', hospitalId: 'hospital-4', selectedByPatientAt: null }),
        contactFixture({ id: 'contact-removed', hospitalId: 'hospital-5', removedAt: '2026-04-03T12:00:00.000Z' }),
      ],
      {
        'hospital-1': 'Shanghai One',
        'hospital-2': 'Shanghai Two',
        'hospital-3': 'Shanghai Three',
      },
    );

    expect(hospitals).toEqual([
      { contactId: 'contact-selected', hospitalId: 'hospital-1', hospitalName: 'Shanghai One', statusLabel: 'Selected', hasFollowUpSent: false },
      { contactId: 'contact-requested', hospitalId: 'hospital-2', hospitalName: 'Shanghai Two', statusLabel: 'Quote Prompt Sent', hasFollowUpSent: true },
      { contactId: 'contact-quoted', hospitalId: 'hospital-3', hospitalName: 'Shanghai Three', statusLabel: 'Quoted', hasFollowUpSent: false },
    ]);
  });
});

describe('collectQuoteRequestTargets', () => {
  it('returns all patient-selected contacts that can still be nudged for quotes', () => {
    const targets = collectQuoteRequestTargets([
      contactFixture({ id: 'contact-selected', hospitalId: 'hospital-1' }),
      contactFixture({ id: 'contact-requested', hospitalId: 'hospital-2', reminderSentAt: '2026-04-03T11:00:00.000Z' }),
      contactFixture({ id: 'contact-quoted', hospitalId: 'hospital-3', subStatus: 'QUOTED', quoteId: 'quote-1' }),
      contactFixture({ id: 'contact-admin', hospitalId: 'hospital-4', selectedByPatientAt: null }),
      contactFixture({ id: 'contact-removed', hospitalId: 'hospital-5', removedAt: '2026-04-03T12:00:00.000Z' }),
    ]);

    expect(targets).toEqual(['contact-selected', 'contact-requested']);
  });
});
