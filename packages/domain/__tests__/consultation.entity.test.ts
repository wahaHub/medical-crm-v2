import { describe, it, expect } from 'vitest';
import { Consultation } from '../src/entities/consultation.entity.js';

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
) {
  return new Consultation({
    id: 'cons-1',
    caseId: 'case-1',
    hospitalId: 'h-1',
    patientId: 'p-1',
    doctorId: null,
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-03-15T10:00:00Z'),
    startedAt: null,
    endedAt: null,
    durationMinutes: 30,
    actualDuration: null,
    consultationLink: null,
    aiTranslation: false,
    patientLanguage: 'en',
    notes: null,
    videoStorageKey: null,
    videoSize: null,
    videoDuration: null,
    videoThumbnail: null,
    videoUploadedAt: null,
    aiSummary: null,
    aiSummaryCreatedAt: null,
    aiSummaryStatus: 'PENDING',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('Consultation', () => {
  it('start() transitions SCHEDULED→IN_PROGRESS and sets startedAt', () => {
    const c = makeConsultation({ status: 'SCHEDULED' });
    c.start();
    expect(c.status).toBe('IN_PROGRESS');
    expect(c.startedAt).toBeInstanceOf(Date);
  });

  it('start() throws when status is COMPLETED', () => {
    const c = makeConsultation({ status: 'COMPLETED' });
    expect(() => c.start()).toThrow();
  });

  it('complete() transitions IN_PROGRESS→COMPLETED, sets endedAt and calculates actualDuration', () => {
    const startedAt = new Date('2026-03-15T10:00:00Z');
    const c = makeConsultation({ status: 'IN_PROGRESS', startedAt });
    c.complete();
    expect(c.status).toBe('COMPLETED');
    expect(c.endedAt).toBeInstanceOf(Date);
    expect(typeof c.actualDuration).toBe('number');
  });

  it('cancel() transitions SCHEDULED→CANCELLED', () => {
    const c = makeConsultation({ status: 'SCHEDULED' });
    c.cancel();
    expect(c.status).toBe('CANCELLED');
  });

  it('noShow() transitions SCHEDULED→NO_SHOW', () => {
    const c = makeConsultation({ status: 'SCHEDULED' });
    c.noShow();
    expect(c.status).toBe('NO_SHOW');
  });

  it('setVideoInfo() sets all video fields', () => {
    const c = makeConsultation();
    const uploadedAt = new Date('2026-03-15T11:00:00Z');
    c.setVideoInfo({
      videoStorageKey: 'storage/video-1.mp4',
      videoSize: 1024000,
      videoDuration: 1800,
      videoThumbnail: 'storage/thumb-1.jpg',
      videoUploadedAt: uploadedAt,
    });
    expect(c.videoStorageKey).toBe('storage/video-1.mp4');
    expect(c.videoSize).toBe(1024000);
    expect(c.videoDuration).toBe(1800);
    expect(c.videoThumbnail).toBe('storage/thumb-1.jpg');
    expect(c.videoUploadedAt).toEqual(uploadedAt);
  });

  it('setAiSummary() sets aiSummary, aiSummaryCreatedAt, and aiSummaryStatus=COMPLETED', () => {
    const c = makeConsultation();
    const summary = { text: 'Patient discussed symptoms', keywords: ['pain', 'fever'] };
    c.setAiSummary(summary);
    expect(c.aiSummary).toEqual(summary);
    expect(c.aiSummaryCreatedAt).toBeInstanceOf(Date);
    expect(c.aiSummaryStatus).toBe('COMPLETED');
  });
});
