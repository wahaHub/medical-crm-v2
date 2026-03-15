import { describe, it, expect } from 'vitest';
import {
  ConsultationTranscript,
  type TranscriptEntry,
} from '../src/entities/consultation-transcript.entity.js';

function makeConsultationTranscript(
  overrides: Partial<
    ConstructorParameters<typeof ConsultationTranscript>[0]
  > = {},
) {
  const entries: TranscriptEntry[] = [
    {
      timestamp: 0,
      speaker: 'Doctor',
      text: 'Hello patient',
      translatedText: 'Hello patient',
    },
  ];

  return new ConsultationTranscript({
    id: 'ct-1',
    consultationId: 'consultation-1',
    originalLang: 'en',
    translatedLang: 'zh',
    entries,
    status: 'PENDING',
    generatedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('ConsultationTranscript', () => {
  it('constructs with all fields', () => {
    const ct = makeConsultationTranscript();
    expect(ct.id).toBe('ct-1');
    expect(ct.consultationId).toBe('consultation-1');
    expect(ct.originalLang).toBe('en');
    expect(ct.translatedLang).toBe('zh');
    expect(ct.status).toBe('PENDING');
    expect(ct.generatedAt).toBeNull();
    expect(ct.createdAt).toEqual(new Date('2026-01-01'));
    expect(ct.updatedAt).toEqual(new Date('2026-01-01'));
  });

  it('default status is as provided in props', () => {
    const ct = makeConsultationTranscript({ status: 'PROCESSING' });
    expect(ct.status).toBe('PROCESSING');
  });

  it('entries is a typed array of TranscriptEntry', () => {
    const entries: TranscriptEntry[] = [
      {
        timestamp: 0,
        speaker: 'Doctor',
        text: 'How are you?',
      },
      {
        timestamp: 5000,
        speaker: 'Patient',
        text: 'I am fine',
        translatedText: 'I am fine',
      },
    ];
    const ct = makeConsultationTranscript({ entries });
    expect(ct.entries).toHaveLength(2);
    expect(ct.entries[0].speaker).toBe('Doctor');
    expect(ct.entries[0].timestamp).toBe(0);
    expect(ct.entries[1].speaker).toBe('Patient');
    expect(ct.entries[1].translatedText).toBe('I am fine');
  });
});
