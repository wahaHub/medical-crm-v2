import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetHospitalCaseDetailUseCase } from '../src/use-cases/cases/get-hospital-case-detail.use-case.js';
import type {
  ICaseRepository,
  ICaseProgressRepository,
  IDocumentRepository,
  IStorageService,
  IPatientRepository,
  IConversationRepository,
  IMessageRepository,
} from '@medical-crm/domain';
import { Case, CaseNumber, CaseProgress, Document } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GetHospitalCaseDetailUseCase', () => {
  let useCase: GetHospitalCaseDetailUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockProgressRepo: ICaseProgressRepository;
  let mockDocumentRepo: IDocumentRepository;
  let mockStorageService: IStorageService;
  let mockPatientRepo: IPatientRepository;
  let mockConversationRepo: IConversationRepository;
  let mockMessageRepo: IMessageRepository;

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    hospitalId: null,
  };

  const hospitalActor: Actor = {
    userId: 'hospital-1',
    email: 'hospital@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-1',
  };

  const otherHospitalActor: Actor = {
    userId: 'hospital-2',
    email: 'other@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-2',
  };

  const mockCase = new Case({
    id: 'case-id-1',
    caseNumber: new CaseNumber('CASE-2026-0042'),
    patientId: 'patient-1',
    patientName: 'Jane Doe',
    patientCountry: 'CN',
    patientLanguage: 'zh',
    assignedHospitalId: 'hosp-1',
    primaryDiagnosis: 'Double eyelid surgery',
    diagnosisCode: 'H02.3',
    symptoms: ['drooping eyelids'],
    medicalHistory: 'No known allergies',
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: new Date('2026-01-15T10:00:00Z'),
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
  });

  const mockProgressDiagnosis = new CaseProgress({
    id: 'prog-1',
    caseId: 'case-id-1',
    title: 'Diagnosis: Ptosis',
    description: 'Initial diagnosis',
    progressType: 'STATUS_CHANGE',
    metadata: { kind: 'diagnosis', icdCode: 'H02.3', severity: 'moderate' },
    recordedAt: new Date('2026-01-16T09:00:00Z'),
    recordedById: 'doctor-1',
  });

  const mockProgressPhoneCall = new CaseProgress({
    id: 'prog-2',
    caseId: 'case-id-1',
    title: 'Follow-up call',
    description: null,
    progressType: 'STATUS_CHANGE',
    metadata: { kind: 'phone_call', callResult: 'scheduled', summary: 'Patient agreed to surgery' },
    recordedAt: new Date('2026-01-17T11:00:00Z'),
    recordedById: 'staff-1',
  });

  const mockProgressConsultation = new CaseProgress({
    id: 'prog-3',
    caseId: 'case-id-1',
    title: 'Video consultation',
    description: 'Pre-surgical video call',
    progressType: 'VIDEO_CONSULTATION',
    metadata: null,
    recordedAt: new Date('2026-01-18T14:00:00Z'),
    recordedById: 'doctor-1',
  });

  const mockDocument = new Document({
    id: 'doc-1',
    caseId: 'case-id-1',
    uploadedById: 'patient-1',
    fileName: 'xray.jpg',
    fileSize: 204800,
    mimeType: 'image/jpeg',
    storageKey: 'cases/case-id-1/xray.jpg',
    documentType: 'IMAGING',
    sensitivity: 'PHI_HIGH',
    language: 'zh',
    isTranslated: false,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-11T10:00:00Z'),
    updatedAt: new Date('2026-01-11T10:00:00Z'),
  });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(mockCase),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockProgressRepo = {
      findByCaseId: vi.fn().mockResolvedValue([
        mockProgressDiagnosis,
        mockProgressPhoneCall,
        mockProgressConsultation,
      ]),
      save: vi.fn(),
    };

    mockDocumentRepo = {
      findById: vi.fn(),
      findByCaseId: vi.fn().mockResolvedValue([mockDocument]),
      save: vi.fn(),
      softDelete: vi.fn(),
    };

    mockStorageService = {
      createPresignedUpload: vi.fn(),
      getSignedUrl: vi.fn(),
      getSignedUrls: vi.fn().mockResolvedValue({
        'cases/case-id-1/xray.jpg': 'https://storage.example.com/signed/xray.jpg',
      }),
    };

    mockPatientRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'patient-1', patientCode: 'PAT-0042' }),
    };

    mockConversationRepo = {
      findById: vi.fn(),
      findMany: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      save: vi.fn(),
    };

    mockMessageRepo = {
      findById: vi.fn(),
      findByConversationId: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      findPendingReview: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };

    useCase = new GetHospitalCaseDetailUseCase(
      mockCaseRepo,
      mockProgressRepo,
      mockDocumentRepo,
      mockStorageService,
      mockPatientRepo,
      mockConversationRepo,
      mockMessageRepo,
    );
  });

  it('returns aggregated HospitalCaseDetailDTO for ADMIN actor', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.id).toBe('case-id-1');
    expect(result.caseNumber).toBe('CASE-2026-0042');
    expect(result.patient.id).toBe('patient-1');
    expect(result.patient.name).toBe('Jane Doe');
    expect(result.patient.code).toBe('PAT-0042');
    expect(result.patient.country).toBe('CN');
    expect(result.patient.language).toBe('zh');
  });

  it('returns medical condition fields', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.medicalCondition.primaryDiagnosis).toBe('Double eyelid surgery');
    expect(result.medicalCondition.diagnosisCode).toBe('H02.3');
    expect(result.medicalCondition.symptoms).toEqual(['drooping eyelids']);
    expect(result.medicalCondition.medicalHistory).toBe('No known allergies');
  });

  it('splits progress into diagnoses, phoneCalls, and consultationHistory', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.diagnoses).toHaveLength(1);
    expect(result.diagnoses[0]!.id).toBe('prog-1');
    expect(result.diagnoses[0]!.icdCode).toBe('H02.3');
    expect(result.diagnoses[0]!.severity).toBe('moderate');

    expect(result.phoneCalls).toHaveLength(1);
    expect(result.phoneCalls[0]!.id).toBe('prog-2');
    expect(result.phoneCalls[0]!.callResult).toBe('scheduled');

    expect(result.consultationHistory).toHaveLength(1);
    expect(result.consultationHistory[0]!.id).toBe('prog-3');
    expect(result.consultationHistory[0]!.description).toBe('Pre-surgical video call');
  });

  it('includes documents with signed URLs', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.id).toBe('doc-1');
    expect(result.documents[0]!.fileName).toBe('xray.jpg');
    expect(result.documents[0]!.downloadUrl).toBe('https://storage.example.com/signed/xray.jpg');
    expect(mockStorageService.getSignedUrls).toHaveBeenCalledWith(['cases/case-id-1/xray.jpg']);
  });

  it('returns empty documents array and skips getSignedUrls when no documents', async () => {
    mockDocumentRepo.findByCaseId = vi.fn().mockResolvedValue([]);

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.documents).toHaveLength(0);
    expect(mockStorageService.getSignedUrls).not.toHaveBeenCalled();
  });

  it('fetches all data in parallel (caseRepo, progressRepo, documentRepo, patientRepo)', async () => {
    await useCase.execute('case-id-1', adminActor);

    expect(mockProgressRepo.findByCaseId).toHaveBeenCalledWith('case-id-1');
    expect(mockDocumentRepo.findByCaseId).toHaveBeenCalledWith('case-id-1');
    expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1');
  });

  it('returns patient code as empty string when patientInfo is null', async () => {
    mockPatientRepo.findById = vi.fn().mockResolvedValue(null);

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.patient.code).toBe('');
  });

  it('returns patient code as empty string when patientCode is null', async () => {
    mockPatientRepo.findById = vi.fn().mockResolvedValue({ id: 'patient-1', patientCode: null });

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.patient.code).toBe('');
  });

  it('allows HOSPITAL actor to access their own case', async () => {
    const result = await useCase.execute('case-id-1', hospitalActor);

    expect(result.id).toBe('case-id-1');
  });

  it('throws ForbiddenError when HOSPITAL actor accesses a case belonging to a different hospital', async () => {
    await expect(
      useCase.execute('case-id-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent-id', adminActor),
    ).rejects.toThrow('Case nonexistent-id not found');
  });

  it('throws NotFoundError for HOSPITAL actor on missing case', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-case', hospitalActor),
    ).rejects.toThrow('Case missing-case not found');
  });

  it('maps displayStatus based on stage', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.displayStatus).toBe('transferred');
  });

  it('maps legacy intake questionnaire payloads from structuredData', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(new Case({
      ...mockCase,
      structuredData: {
        step2_symptom_location: {
          primary_location: 'Face',
          symptom_nature: ['Pain', 'Swelling'],
          onset_time: '2 weeks',
          progression_trend: 'Worsening',
          diagnosis_stage: 'Diagnosed',
          main_category: 'Maxillofacial',
        },
        step3_detailed_symptoms: {
          detailed_description: 'Facial swelling and pain after surgery',
          aggravating_factors: ['Cold weather'],
          relieving_factors: ['Pain medication'],
          previous_treatments: 'Antibiotics',
        },
        step4_medical_history: {
          past_medical_history: {
            diabetes: true,
            other: 'Asthma',
          },
          chronic_conditions_description: 'Type 2 diabetes',
          family_history_description: 'Family history of asthma',
        },
        step5_medications_allergies: {
          current_medications: [
            { name: 'Ibuprofen', dosage: '200mg' },
          ],
          allergies: {
            drug_allergies: [{ substance: 'Penicillin', reaction: 'Rash' }],
            food_allergies: [{ substance: 'Shrimp', reaction: 'Hives' }],
          },
        },
        step6_examinations: {
          exam_types_selected: ['CT', 'MRI'],
          exam_details_summary: 'CT completed in local hospital',
          lab_results_summary: 'CBC normal',
        },
        step7_expectations: {
          treatment_expectations: ['Pain relief', 'Functional recovery'],
          budget_range: '$5k-$10k',
          preferred_timing: 'Within 1 month',
        },
      },
    }));

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.medicalIntake.step1).toEqual({
      symptomLocation: 'Face',
      symptomNature: ['Pain', 'Swelling'],
      onsetTime: '2 weeks',
      progressTrend: 'Worsening',
      diagnosisStage: 'Diagnosed',
      diseaseCategory: 'Maxillofacial',
    });
    expect(result.medicalIntake.step2).toEqual({
      detailedDescription: 'Facial swelling and pain after surgery',
      aggravatingFactors: ['Cold weather'],
      relievingFactors: ['Pain medication'],
      previousTreatment: 'Antibiotics',
    });
    expect(result.medicalIntake.step3).toEqual({
      medicalHistory: ['Diabetes', 'Asthma'],
      chronicConditions: 'Type 2 diabetes',
      familyHistory: 'Family history of asthma',
    });
    expect(result.medicalIntake.step4).toEqual({
      currentMedications: 'Ibuprofen (200mg)',
      drugAllergies: 'Penicillin (Rash)',
      foodAllergies: 'Shrimp (Hives)',
    });
    expect(result.medicalIntake.step5).toEqual({
      examTypes: ['CT', 'MRI'],
      examDetails: 'CT completed in local hospital',
      labResults: 'CBC normal',
      treatmentExpectations: ['Pain relief', 'Functional recovery'],
      budgetRange: '$5k-$10k',
      expectedTimeline: 'Within 1 month',
    });
  });

  it('keeps legacy diagnosis progress rows visible when metadata.kind is missing', async () => {
    mockProgressRepo.findByCaseId = vi.fn().mockResolvedValue([
      new CaseProgress({
        id: 'legacy-diagnosis',
        caseId: 'case-id-1',
        title: 'Orbital fracture',
        description: 'Confirmed by CT',
        progressType: 'STATUS_CHANGE',
        metadata: {
          type: 'confirmed',
          icdCode: 'S02.8',
          severity: 'severe',
          treatmentRecommendation: 'Surgical fixation',
          suggestedTests: 'Repeat CT',
        },
        recordedAt: new Date('2026-01-19T10:00:00Z'),
        recordedById: 'doctor-2',
      }),
    ]);

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.diagnoses).toHaveLength(1);
    expect(result.diagnoses[0]).toEqual(expect.objectContaining({
      id: 'legacy-diagnosis',
      title: 'Orbital fracture',
      icdCode: 'S02.8',
      severity: 'severe',
      treatmentRecommendation: 'Surgical fixation',
      suggestedTests: 'Repeat CT',
    }));
  });
});
