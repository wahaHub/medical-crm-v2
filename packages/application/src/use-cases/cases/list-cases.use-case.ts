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
    const labelsToGenerate = entities
      .filter((entity) => needsListLabel(entity))
      .map((entity) => {
        const patient = patientById.get(entity.patientId);
        return {
          caseId: entity.id,
          text: buildDiseaseSourceText(entity),
          phone: patient?.phone,
          fallbackCountry: patient?.country ?? getEntryProfileCountry(entity) ?? entity.patientCountry,
        };
      })
      .filter(({ text, phone, fallbackCountry }) => text.length > 0 || Boolean(phone) || Boolean(fallbackCountry));
    let generated: Record<string, { disease: string | null; country: string | null }> = {};
    try {
      generated = await this.diseaseSummarizer?.summarize(labelsToGenerate) ?? {};
    } catch (error) {
      console.warn('[Cases] Failed to summarize disease labels:', error);
    }

    return Promise.all(entities.map(async (entity) => {
      const patient = patientById.get(entity.patientId);
      const generatedLabel = generated[entity.id];
      if (generatedLabel) {
        entity.structuredData = {
          ...(entity.structuredData ?? {}),
          adminCaseList: {
            ...asRecord(entity.structuredData?.['adminCaseList']),
            disease: generatedLabel.disease,
            country: generatedLabel.country,
            labelVersion: 3,
          },
        };
        await this.caseRepo.updateStructuredData?.(entity.id, entity.structuredData);
      }
      return toCaseDTO(entity, undefined, {
        email: patient?.email,
        phone: patient?.phone,
        country: patient?.country,
        patientSite: patient?.site,
      }, generatedLabel ?? getCachedListLabel(entity));
    }));
  }
}

function needsListLabel(entity: Awaited<ReturnType<ICaseRepository['findMany']>>['data'][number]): boolean {
  const structured = asRecord(entity.structuredData);
  return asRecord(structured?.['adminCaseList'])?.['labelVersion'] !== 3;
}

function getCachedListLabel(entity: Awaited<ReturnType<ICaseRepository['findMany']>>['data'][number]): { disease: string | null; country: string | null } | null {
  const label = asRecord(asRecord(entity.structuredData)?.['adminCaseList']);
  const disease = typeof label?.['disease'] === 'string' ? label['disease'].trim() : null;
  const country = typeof label?.['country'] === 'string' ? label['country'].trim() : null;
  return disease || country ? { disease, country } : null;
}

function getEntryProfileCountry(entity: Awaited<ReturnType<ICaseRepository['findMany']>>['data'][number]): string | null {
  const country = asRecord(asRecord(entity.structuredData)?.['entryProfile'])?.['country'];
  return typeof country === 'string' && country.trim() ? country.trim() : null;
}

function buildDiseaseSourceText(entity: Awaited<ReturnType<ICaseRepository['findMany']>>['data'][number]): string {
  const entryProfile = asRecord(asRecord(entity.structuredData)?.['entryProfile']);
  return [
    entryProfile?.['disease'],
    entity.conditionSummary,
    entity.primaryDiagnosis,
    entity.medicalHistory,
    ...(entity.symptoms ?? []),
    entity.aiSummary,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n').slice(0, 4000);
}
