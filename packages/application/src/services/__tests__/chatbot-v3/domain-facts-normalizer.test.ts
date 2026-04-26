import { describe, expect, it } from 'vitest';
import { normalizeFactsFromStatusSnapshot } from '../../chatbot-v3/domain-facts-normalizer.js';

describe('normalizeFactsFromStatusSnapshot', () => {
  it('maps existing snapshot fields into normalized reducer facts', () => {
    const facts = normalizeFactsFromStatusSnapshot({
      minimalTriageStatus: 'pending',
      minimalTriageAnswersSummary: 'brain tumor, severe pain',
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['h1'],
      processExplained: true,
      supportingDocuments: [{ name: 'MRI.pdf', path: '/docs/mri.pdf' }],
    });

    expect(facts.intake.minimalTriageStatus).toBe('submitted');
    expect(facts.intake.minimalTriageSummary).toBe('brain tumor, severe pain');
    expect(facts.recommendation.status).toBe('selected');
    expect(facts.recommendation.selectedHospitalIds).toEqual(['h1']);
    expect(facts.process.explained).toBe(true);
    expect(facts.records.supportingDocumentsCount).toBe(1);
  });

  it('preserves submitted triage summary without compacting it inside the normalizer', () => {
    const submittedSummary = 'line 1\nline 2 with exact user-submitted details';

    const facts = normalizeFactsFromStatusSnapshot({
      minimalTriageStatus: 'pending',
      minimalTriageAnswersSummary: submittedSummary,
    });

    expect(facts.intake.minimalTriageStatus).toBe('submitted');
    expect(facts.intake.minimalTriageSummary).toBe(submittedSummary);
  });

  it('honors legacy canonical minimalTriageComplete truth when structured status is still pending', () => {
    const facts = normalizeFactsFromStatusSnapshot({
      minimalTriageStatus: 'pending',
      minimalTriageAnswersSummary: null,
      minimalTriageComplete: true,
    });

    expect(facts.intake.minimalTriageStatus).toBe('submitted');
    expect(facts.intake.minimalTriageSummary).toBeNull();
  });

  it('honors legacy generated recommendation truth when structured selection status is absent', () => {
    const facts = normalizeFactsFromStatusSnapshot({
      recommendationGenerated: true,
      recommendationSelectionStatus: null,
      recommendationSelectedHospitalIds: null,
    });

    expect(facts.recommendation.status).toBe('generated');
  });

  it('honors legacy selected recommendation truth when structured selected ids are absent', () => {
    const facts = normalizeFactsFromStatusSnapshot({
      recommendationGenerated: true,
      recommendationSelected: true,
      recommendationSelectionStatus: null,
      recommendationSelectedHospitalIds: null,
    });

    expect(facts.recommendation.status).toBe('selected');
  });
});
