import type { ICaseRepository, CaseListQuery, ICaseDiseaseSummarizer, IPatientRepository } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import { ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';
import { withDefaultPatientEmailExclusions } from '../../access/patient-email-domain-exclusions.js';
import { asRecord } from '../../utils/structured-data.js';

export class ListCasesUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly patientRepo?: IPatientRepository,
    private readonly diseaseSummarizer?: ICaseDiseaseSummarizer,
  ) {}

  async execute(query: CaseListQuery, actor: Actor): Promise<PaginatedResult<CaseDTO>> {
    let hospitalId: string | undefined;
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      hospitalId = actor.hospitalId;
    }
    const patientSiteScope = getAdminPatientSiteScope(actor);
    const scopedQuery = withDefaultPatientEmailExclusions(
      patientSiteScope ? { ...query, patientSiteScope } : query,
    );
    const result = await this.caseRepo.findMany(scopedQuery, hospitalId);
    return {
      ...result,
      data: await this.mapCases(result.data),
    };
  }

  private async mapCases(entities: Awaited<ReturnType<ICaseRepository['findMany']>>['data']) {
    const patients = this.patientRepo?.findByIds
      ? await this.patientRepo.findByIds(entities.map((entity) => entity.patientId))
      : [];
    const patientById = new Map(patients.map((patient) => [patient.id, patient]));
    const missingDisease = entities
      .map((entity) => ({ entity, disease: getDiseaseLabel(entity) }))
      .filter(({ disease }) => !disease)
      .map(({ entity }) => ({ caseId: entity.id, text: buildDiseaseSourceText(entity) }))
      .filter(({ text }) => text.length > 0);
    let generated: Record<string, string> = {};
    try {
      generated = await this.diseaseSummarizer?.summarize(missingDisease) ?? {};
    } catch (error) {
      console.warn('[Cases] Failed to summarize disease labels:', error);
    }

    return Promise.all(entities.map(async (entity) => {
      const patient = patientById.get(entity.patientId);
      const generatedDisease = generated[entity.id];
      if (generatedDisease) {
        entity.structuredData = {
          ...(entity.structuredData ?? {}),
          adminCaseList: {
            ...asRecord(entity.structuredData?.['adminCaseList']),
            disease: generatedDisease,
          },
        };
        await this.caseRepo.updateStructuredData?.(entity.id, entity.structuredData);
      }
      return toCaseDTO(entity, undefined, {
        email: patient?.email,
        phone: patient?.phone,
        country: patient?.country,
        patientSite: patient?.site,
      }, generatedDisease);
    }));
  }
}

function getDiseaseLabel(entity: Awaited<ReturnType<ICaseRepository['findMany']>>['data'][number]): string | null {
  const structured = asRecord(entity.structuredData);
  const cached = asRecord(structured?.['adminCaseList'])?.['disease'];
  if (typeof cached === 'string' && cached.trim()) return cached.trim();
  const profile = asRecord(structured?.['entryProfile']);
  for (const value of [profile?.['disease'], entity.primaryDiagnosis]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function buildDiseaseSourceText(entity: Awaited<ReturnType<ICaseRepository['findMany']>>['data'][number]): string {
  return [
    entity.conditionSummary,
    entity.primaryDiagnosis,
    entity.medicalHistory,
    ...(entity.symptoms ?? []),
    entity.aiSummary,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n').slice(0, 4000);
}
