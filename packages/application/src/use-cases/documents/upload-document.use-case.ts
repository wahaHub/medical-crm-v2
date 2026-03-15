import type { ICaseRepository, IDocumentRepository, ICaseProgressRepository, IStorageService, DocumentType, Sensitivity } from '@medical-crm/domain';
import { Document, CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { PresignedUploadResult } from '@medical-crm/domain';

export interface UploadDocumentInput {
  caseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  sensitivity: string;
  language: string;
}

export class UploadDocumentUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly storageService: IStorageService,
  ) {}

  async execute(input: UploadDocumentInput, actor: Actor): Promise<{ upload: PresignedUploadResult; documentId: string }> {
    const caze = await this.caseRepo.findById(input.caseId);
    if (!caze) throw new NotFoundError(`Case ${input.caseId} not found`);
    if (actor.role === 'HOSPITAL' && caze.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const docId = generateId();
    const storageKey = `documents/${input.caseId}/${docId}/${input.fileName}`;
    const upload = await this.storageService.createPresignedUpload(storageKey, input.mimeType);

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

    return { upload, documentId: docId };
  }
}
