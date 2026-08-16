import type {
  IMergeRepository,
  ICaseRepository,
  ICaseEventRepository,
  IAuditLogRepository,
  TransactionRunner,
  PatientMergeSnapshot,
  PatientResourceCounts,
  PatientContactFields,
} from '@medical-crm/domain';
import { CaseEvent } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError, ValidationError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface MergePatientsInput {
  /** The surviving profile */
  primaryPatientId: string;
  /** The profile being merged away (soft-marked, login blocked) */
  secondaryPatientId: string;
  /** When true, only return the preview — no writes */
  dryRun?: boolean;
}

export interface PatientContactConflict {
  field: keyof PatientContactFields;
  primaryValue: string;
  secondaryValue: string;
}

export interface MergePatientsResult {
  dryRun: boolean;
  merged: boolean;
  primary: PatientMergeSnapshot;
  secondary: PatientMergeSnapshot;
  transferred: PatientResourceCounts;
  movedCases: Array<{ id: string; caseNumber: string }>;
  contactResolution: {
    /** Secondary values copied onto NULL primary fields */
    filledOnPrimary: Partial<PatientContactFields>;
    /** Both sides had different values — primary wins, secondary value kept in audit metadata */
    conflicts: PatientContactConflict[];
  };
}

const CONTACT_FIELDS = ['email', 'phone', 'whatsapp'] as const;

/**
 * Case Lifecycle Phase 2: merge two patient profiles. All secondary resources
 * are re-pointed to the primary inside a single transaction; the secondary
 * profile is soft-marked (merged_into_user_id) and blocked from patient login.
 * The merge is irreversible.
 */
export class MergePatientsUseCase {
  constructor(
    private readonly mergeRepo: IMergeRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly eventRepo: ICaseEventRepository,
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly txRunner: TransactionRunner,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(input: MergePatientsInput, actor: Actor): Promise<MergePatientsResult> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can merge patients');
    }
    if (input.primaryPatientId === input.secondaryPatientId) {
      throw new ValidationError('Cannot merge a patient into itself');
    }

    const primary = await this.mergeRepo.getPatientSnapshot(input.primaryPatientId);
    if (!primary || primary.role !== 'PATIENT') {
      throw new NotFoundError(`Primary patient ${input.primaryPatientId} not found`);
    }
    const secondary = await this.mergeRepo.getPatientSnapshot(input.secondaryPatientId);
    if (!secondary || secondary.role !== 'PATIENT') {
      throw new NotFoundError(`Secondary patient ${input.secondaryPatientId} not found`);
    }
    if (primary.mergedIntoUserId) {
      throw new ValidationError('Primary patient is itself merged into another profile');
    }
    if (secondary.mergedIntoUserId) {
      throw new ValidationError('Secondary patient is already merged into another profile');
    }

    await this.adminAccess?.assertActorCanAccessPatient(actor, primary.id);
    await this.adminAccess?.assertActorCanAccessPatient(actor, secondary.id);

    const filledOnPrimary: Partial<PatientContactFields> = {};
    const conflicts: PatientContactConflict[] = [];
    for (const field of CONTACT_FIELDS) {
      const primaryValue = primary[field]?.trim() || null;
      const secondaryValue = secondary[field]?.trim() || null;
      if (!secondaryValue) continue;
      if (!primaryValue) {
        filledOnPrimary[field] = secondaryValue;
      } else if (primaryValue !== secondaryValue) {
        conflicts.push({ field, primaryValue, secondaryValue });
      }
    }

    const movedCases = (await this.caseRepo.findByPatientId(secondary.id))
      .map((c) => ({ id: c.id, caseNumber: c.caseNumber.value }));

    if (input.dryRun) {
      const transferred = await this.mergeRepo.countPatientResources(secondary.id);
      return {
        dryRun: true,
        merged: false,
        primary,
        secondary,
        transferred,
        movedCases,
        contactResolution: { filledOnPrimary, conflicts },
      };
    }

    const transferred = await this.txRunner.run(async (tx) => {
      // Re-validate inside the transaction so a concurrent merge cannot slip through
      const secondaryNow = await this.mergeRepo.getPatientSnapshot(secondary.id, tx);
      if (!secondaryNow || secondaryNow.mergedIntoUserId) {
        throw new ValidationError('Secondary patient is already merged into another profile');
      }

      if (Object.keys(filledOnPrimary).length > 0) {
        await this.mergeRepo.fillPrimaryContactFields(primary.id, filledOnPrimary, tx);
      }
      const counts = await this.mergeRepo.transferPatientResources(secondary.id, primary.id, tx);
      await this.mergeRepo.markPatientMerged(secondary.id, primary.id, tx);

      for (const moved of movedCases) {
        await this.eventRepo.save(new CaseEvent({
          id: generateId(),
          caseId: moved.id,
          eventType: 'PATIENT_MERGED',
          actorType: 'ADMIN',
          actorId: actor.userId,
          eventData: {
            primaryPatientId: primary.id,
            secondaryPatientId: secondary.id,
            secondaryPatientName: secondary.name,
            secondaryContact: {
              email: secondary.email,
              phone: secondary.phone,
              whatsapp: secondary.whatsapp,
            },
          },
          isVisibleToPatient: false,
          createdAt: new Date(),
        }), tx);
      }

      await this.auditLogRepo.record({
        userId: actor.userId,
        event: 'PATIENT_MERGED',
        metadata: {
          primaryPatientId: primary.id,
          secondaryPatientId: secondary.id,
          primarySnapshot: { name: primary.name, email: primary.email, phone: primary.phone, whatsapp: primary.whatsapp },
          secondarySnapshot: { name: secondary.name, email: secondary.email, phone: secondary.phone, whatsapp: secondary.whatsapp },
          contactResolution: { filledOnPrimary, conflicts },
          transferred: counts,
          movedCaseIds: movedCases.map((c) => c.id),
        },
      }, tx);

      return counts;
    });

    // TODO(P2): disable the secondary patient's Keycloak account via the admin
    // API once that capability exists in packages/infrastructure/auth. Login is
    // already blocked at the patient auth use cases via merged_into_user_id.

    return {
      dryRun: false,
      merged: true,
      primary,
      secondary,
      transferred,
      movedCases,
      contactResolution: { filledOnPrimary, conflicts },
    };
  }
}
