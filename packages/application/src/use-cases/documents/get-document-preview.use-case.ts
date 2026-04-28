import type { ICaseRepository, IDocumentRepository, IStorageService, ICHCRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface DocumentPreviewResult {
  body: ArrayBuffer;
  contentType: string;
  fileName: string;
}

export class GetDocumentPreviewUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly storageService: IStorageService,
    private readonly chcRepo?: ICHCRepository,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async execute(caseId: string, documentId: string, actor: Actor): Promise<DocumentPreviewResult> {
    const doc = await this.documentRepo.findById(documentId);
    if (!doc || doc.caseId !== caseId || doc.status === 'DELETED') {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    const caze = await this.caseRepo.findById(caseId);
    if (!caze) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins and hospital users can preview case documents');
    }

    const signedUrl = await this.storageService.getSignedUrl(doc.storageKey);
    let response: Response;
    try {
      response = await this.fetchFn(signedUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch document preview: ${message}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch document preview: storage returned ${response.status}`);
    }

    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get('content-type') ?? doc.mimeType ?? 'application/octet-stream',
      fileName: doc.fileName,
    };
  }
}
