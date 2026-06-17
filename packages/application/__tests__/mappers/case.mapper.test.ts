import { describe, expect, it } from 'vitest';
import { toCaseDTO, toHospitalCaseDetailDTO } from '../../src/mappers/case.mapper.js';

describe('toCaseDTO', () => {
  it('maps extended entry profile fields into the admin case summary', () => {
    const dto = toCaseDTO(
      {
        id: 'case-1',
        caseNumber: { value: 'CASE-2026-0001' },
        patientId: 'patient-1',
        patientName: 'Hao Wang',
        patientCountry: 'Shanghai',
        patientLanguage: 'en',
        assignedHospitalId: null,
        primaryDiagnosis: null,
        diagnosisCode: null,
        symptoms: null,
        medicalHistory: null,
        aiSummary: null,
        aiSummaryLanguage: null,
        riskLevel: null,
        status: 'DRAFT',
        stage: 'PENDING_ASSIGNMENT',
        assignedAt: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
        assignmentStatus: 'UNASSIGNED',
        treatmentStage: null,
        conditionSummary: null,
        structuredData: {
          entryProfile: {
            department: 'ENT/Otolaryngology',
            disease: 'Loss of smell',
            gender: 'female',
            country: 'Singapore',
            treatmentTime: '1-3 months',
          },
        },
        riskFlags: null,
        priority: null,
        lastEventAt: null,
        aiSummaryStatus: 'PENDING',
        questionCollectorTemplateId: null,
      } as any,
      null as any,
      {
        email: 'hao@example.com',
        phone: '+123456789',
      },
    );

    expect(dto.gender).toBe('female');
    expect(dto.country).toBe('Singapore');
    expect(dto.destination).toBeNull();
    expect(dto.treatmentTime).toBe('1-3 months');
    expect(dto.department).toBe('ENT/Otolaryngology');
    expect(dto.disease).toBe('Loss of smell');
  });

  it('falls back to legacy patientCountry only for country, not destination', () => {
    const dto = toCaseDTO(
      {
        id: 'case-2',
        caseNumber: { value: 'CASE-2026-0002' },
        patientId: 'patient-2',
        patientName: 'Legacy Patient',
        patientCountry: 'Canada',
        patientLanguage: 'en',
        assignedHospitalId: null,
        hospitalName: null,
        primaryDiagnosis: null,
        diagnosisCode: null,
        symptoms: null,
        medicalHistory: null,
        aiSummary: null,
        aiSummaryLanguage: null,
        riskLevel: null,
        status: 'DRAFT',
        stage: 'PENDING_ASSIGNMENT',
        assignedAt: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
        assignmentStatus: 'UNASSIGNED',
        treatmentStage: null,
        conditionSummary: null,
        structuredData: null,
        riskFlags: null,
        priority: null,
        lastEventAt: null,
        aiSummaryStatus: 'PENDING',
        questionCollectorTemplateId: null,
      } as any,
      null as any,
      {
        email: 'legacy@example.com',
        phone: '+1987654321',
      },
    );

    expect(dto.country).toBe('Canada');
    expect(dto.destination).toBeNull();
  });
});

describe('toHospitalCaseDetailDTO', () => {
  it('maps patient site into the hospital detail hospital type', () => {
    const baseCase = {
      id: 'case-3',
      caseNumber: { value: 'CASE-2026-0003' },
      patientId: 'patient-3',
      patientName: 'Beauty Patient',
      patientCountry: 'US',
      patientLanguage: 'en',
      assignedHospitalId: null,
      primaryDiagnosis: null,
      diagnosisCode: null,
      symptoms: null,
      medicalHistory: null,
      aiSummary: null,
      aiSummaryLanguage: null,
      riskLevel: null,
      status: 'DRAFT',
      stage: 'PENDING_ASSIGNMENT',
      assignedAt: null,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      assignmentStatus: 'UNASSIGNED',
      treatmentStage: null,
      conditionSummary: null,
      structuredData: null,
      riskFlags: null,
      priority: null,
      lastEventAt: null,
      aiSummaryStatus: 'PENDING',
      questionCollectorTemplateId: null,
    } as any;

    const beautyDto = toHospitalCaseDetailDTO(
      baseCase,
      [],
      [],
      {
        id: 'patient-3',
        code: 'P-3',
        preferredLanguage: 'en',
        site: 'beauty',
        age: null,
        gender: null,
      },
    );

    const regularDto = toHospitalCaseDetailDTO(
      baseCase,
      [],
      [],
      {
        id: 'patient-3',
        code: 'P-3',
        preferredLanguage: 'en',
        site: 'china',
        age: null,
        gender: null,
      },
    );

    expect(beautyDto.hospitalType).toBe('COSMETIC');
    expect(regularDto.hospitalType).toBe('REGULAR');
  });
});
