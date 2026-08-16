import type {
  IMergeRepository,
  ICaseRepository,
  ICaseEventRepository,
  IAuditLogRepository,
  TransactionRunner,
  CaseResourceCounts,
} from '@medical-crm/domain';
import { CaseEvent } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError, ValidationError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface MergeCasesInput {
  /** The surviving case */
  primaryCaseId: string;
  /** The case being merged away (status → MERGED, excluded from default lists) */
  secondaryCaseId: string;
  /** Required when the two cases belong to different patients */
  confirmDifferentPatients?: boolean;
  /** When true, only return the preview — no writes */
  dryRun?: boolean;
}

export interface MergeCasesCaseSummary {
  id: string;
  caseNumber: string;
  patientId: string;
  patientName: string;
  status: string;
}

export interface MergeCasesResult {
  dryRun: boolean;
  merged: boolean;
  primary: MergeCasesCaseSummary;
  secondary: MergeCasesCaseSummary;
  transferred: CaseResourceCounts;
  /** true when the two cases belong to different patients (patient merge recommended first) */
  differentPatients: boolean;
  warnings: string[];
}

/**
 * Case Lifecycle Phase 2: merge one case into another. All case-scoped child
 * resources of the secondary case are re-pointed to the primary inside a
 * single transaction; the secondary case is soft-marked (status MERGED +
 * merged_into_case_id) and disappears from default list/board queries.
 * The merge is irreversible.
 */
export class MergeCasesUseCase {
  constructor(
    private readonly mergeRepo: IMergeRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly eventRepo: ICaseEventRepository,
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly txRunner: TransactionRunner,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(input: MergeCasesInput, actor: Actor): Promise<MergeCasesResult> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can merge cases');
    }
    if (input.primaryCaseId === input.secondaryCaseId) {
      throw new ValidationError('Cannot merge a case into itself');
    }

    const primaryEntity = await this.caseRepo.findById(input.primaryCaseId);
    if (!primaryEntity) {
      throw new NotFoundError(`Primary case ${input.primaryCaseId} not found`);
    }
    const secondaryEntity = await this.caseRepo.findById(input.secondaryCaseId);
    if (!secondaryEntity) {
      throw new NotFoundError(`Secondary case ${input.secondaryCaseId} not found`);
    }
    if (primaryEntity.mergedIntoCaseId || primaryEntity.status === 'MERGED') {
      throw new ValidationError('Primary case is itself merged into another case');
    }
    if (secondaryEntity.mergedIntoCaseId || secondaryEntity.status === 'MERGED') {
      throw new ValidationError('Secondary case is already merged into another case');
    }

    await this.adminAccess?.assertActorCanAccessCaseEntity(actor, primaryEntity);
    await this.adminAccess?.assertActorCanAccessCaseEntity(actor, secondaryEntity);

    const primary: MergeCasesCaseSummary = {
      id: primaryEntity.id,
      caseNumber: primaryEntity.caseNumber.value,
      patientId: primaryEntity.patientId,
      patientName: primaryEntity.patientName,
      status: primaryEntity.status,
    };
    const secondary: MergeCasesCaseSummary = {
      id: secondaryEntity.id,
      caseNumber: secondaryEntity.caseNumber.value,
      patientId: secondaryEntity.patientId,
      patientName: secondaryEntity.patientName,
      status: secondaryEntity.status,
    };

    const differentPatients = primary.patientId !== secondary.patientId;
    // Dry-run previews are allowed without confirmation so the UI can show the
    // warning + checkbox; the real merge still requires explicit confirmation.
    if (differentPatients && !input.confirmDifferentPatients && !input.dryRun) {
      throw new ValidationError(
        'Cases belong to different patients. Merge the patient profiles first, or retry with confirmDifferentPatients: true.',
      );
    }

    const warnings: string[] = [];
    if (differentPatients) {
      warnings.push('Cases belong to different patients — consider merging the patient profiles instead.');
    }

    if (input.dryRun) {
      const transferred = await this.mergeRepo.countCaseResources(secondary.id, primary.id);
      if (transferred.caseHospitalContactConflicts > 0) {
        warnings.push(
          `${transferred.caseHospitalContactConflicts} hospital contact(s) already exist on the primary case and will be dropped from the secondary.`,
        );
      }
      if (transferred.journeyConflict) {
        warnings.push('Both cases have a journey — the secondary journey will stay on the merged case.');
      }
      return { dryRun: true, merged: false, primary, secondary, transferred, differentPatients, warnings };
    }

    const transferred = await this.txRunner.run(async (tx) => {
      // Re-validate inside the transaction so a concurrent merge cannot slip through
      const secondaryNow = await this.mergeRepo.getCaseSnapshot(secondary.id, tx);
      if (!secondaryNow || secondaryNow.mergedIntoCaseId || secondaryNow.status === 'MERGED') {
        throw new ValidationError('Secondary case is already merged into another case');
      }
      const primaryNow = await this.mergeRepo.getCaseSnapshot(primary.id, tx);
      if (!primaryNow || primaryNow.mergedIntoCaseId || primaryNow.status === 'MERGED') {
        throw new ValidationError('Primary case is itself merged into another case');
      }

      const counts = await this.mergeRepo.transferCaseResources(secondary.id, primary.id, tx);
      await this.mergeRepo.markCaseMerged(secondary.id, primary.id, tx);

      await this.eventRepo.save(new CaseEvent({
        id: generateId(),
        caseId: primary.id,
        eventType: 'CASE_MERGED',
        actorType: 'ADMIN',
        actorId: actor.userId,
        eventData: {
          secondaryCaseId: secondary.id,
          secondaryCaseNumber: secondary.caseNumber,
          secondaryPatientId: secondary.patientId,
          differentPatients,
          transferred: counts,
        },
        isVisibleToPatient: false,
        createdAt: new Date(),
      }), tx);

      await this.auditLogRepo.record({
        userId: actor.userId,
        event: 'CASE_MERGED',
        caseId: primary.id,
        metadata: {
          primaryCaseId: primary.id,
          primaryCaseNumber: primary.caseNumber,
          secondaryCaseId: secondary.id,
          secondaryCaseNumber: secondary.caseNumber,
          differentPatients,
          transferred: counts,
        },
      }, tx);

      return counts;
    });

    return { dryRun: false, merged: true, primary, secondary, transferred, differentPatients, warnings };
  }
}
