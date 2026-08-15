import type {
  ICaseRepository,
  IDocumentRepository,
  ICaseProgressRepository,
  ICHCRepository,
  DocumentType,
  Sensitivity,
} from '@medical-crm/domain';
import { Document, CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface UploadDocumentInput {
  caseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  sensitivity: string;
  language: string;
  storageKey: string;
  /** Case Lifecycle Phase 1: optional treatment-stage tag; omitted keeps current behavior */
  stageTag?: string;
}

export class UploadDocumentUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async assertCanUpload(caseId: string, actor: Actor): Promise<void> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caze);
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caze);
    }
  }

  async execute(input: UploadDocumentInput, actor: Actor): Promise<{ documentId: string }> {
    await this.assertCanUpload(input.caseId, actor);

    const docId = generateId();
    const storageKey = input.storageKey;
    const existing = await this.documentRepo.findByStorageKey(storageKey);
    if (existing) {
      return { documentId: existing.id };
    }

    const now = new Date();
    const doc = new Document({
      id: docId,
      caseId: input.caseId,
      uploadedById: actor.userId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      storageKey,
      documentType: input.documentType as DocumentType,
      sensitivity: input.sensitivity as Sensitivity,
      language: input.language,
      isTranslated: false,
      status: 'PENDING',
      stageTag: input.stageTag ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await this.documentRepo.save(doc);

    await this.progressRepo.save(new CaseProgress({
      id: generateId(),
      caseId: input.caseId,
      title: `Document uploaded: ${input.fileName}`,
      description: null,
      progressType: 'DOCUMENT_UPLOAD',
      metadata: { documentId: docId },
      recordedAt: now,
      recordedById: actor.userId,
    }));

    return { documentId: docId };
  }
}
