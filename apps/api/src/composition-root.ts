import type {
  ICaseRepository,
  IDocumentRepository,
  ICaseProgressRepository,
  IHospitalRepository,
  IPatientRepository,
  IStorageService,
} from '@medical-crm/domain';
import { CaseAssignmentService } from '@medical-crm/domain';
import {
  CreateCaseUseCase,
  ListCasesUseCase,
  GetCaseUseCase,
  GetHospitalCaseDetailUseCase,
  UpdateCaseUseCase,
  AssignCaseUseCase,
  UpdateCaseStatusUseCase,
  AdvanceCaseStageUseCase,
  GetCaseStatsUseCase,
  UploadDocumentUseCase,
  ListDocumentsUseCase,
  DeleteDocumentUseCase,
  GetCaseProgressUseCase,
  AddCaseProgressUseCase,
} from '@medical-crm/application';
import {
  DrizzleCaseRepository,
  DrizzleDocumentRepository,
  DrizzleCaseProgressRepository,
  DrizzleHospitalRepository,
  DrizzlePatientRepository,
} from '@medical-crm/infrastructure/repositories';
import { SupabaseStorageAdapter } from '@medical-crm/infrastructure/storage';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';

interface AppServices {
  // infrastructure
  crmDb: ReturnType<typeof getCrmDb>;
  mainSupabase: ReturnType<typeof getMainSupabase>;
  chinaSupabase: ReturnType<typeof getChinaSupabase>;

  // repositories
  caseRepo: ICaseRepository;
  documentRepo: IDocumentRepository;
  progressRepo: ICaseProgressRepository;
  hospitalRepo: IHospitalRepository;
  patientRepo: IPatientRepository;
  storage: IStorageService;

  // use cases
  createCase: CreateCaseUseCase;
  listCases: ListCasesUseCase;
  getCase: GetCaseUseCase;
  getHospitalCaseDetail: GetHospitalCaseDetailUseCase;
  updateCase: UpdateCaseUseCase;
  assignCase: AssignCaseUseCase;
  updateCaseStatus: UpdateCaseStatusUseCase;
  advanceCaseStage: AdvanceCaseStageUseCase;
  getCaseStats: GetCaseStatsUseCase;
  uploadDocument: UploadDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  deleteDocument: DeleteDocumentUseCase;
  getCaseProgress: GetCaseProgressUseCase;
  addCaseProgress: AddCaseProgressUseCase;
}

let _services: AppServices | null = null;

/** Wire all infrastructure adapters, repositories, and use cases. Lazy singleton. */
export function getServices(): AppServices {
  if (!_services) {
    const crmDb = getCrmDb();
    const mainSupabase = getMainSupabase();
    const chinaSupabase = getChinaSupabase();

    // Repositories
    const caseRepo = new DrizzleCaseRepository(crmDb);
    const documentRepo = new DrizzleDocumentRepository(crmDb);
    const progressRepo = new DrizzleCaseProgressRepository(crmDb);
    const hospitalRepo = new DrizzleHospitalRepository(crmDb);
    const patientRepo = new DrizzlePatientRepository(crmDb);
    const storage = new SupabaseStorageAdapter(mainSupabase);

    // Domain services
    const assignmentService = new CaseAssignmentService();

    _services = {
      crmDb, mainSupabase, chinaSupabase,
      caseRepo, documentRepo, progressRepo, hospitalRepo, patientRepo, storage,

      createCase: new CreateCaseUseCase(caseRepo),
      listCases: new ListCasesUseCase(caseRepo),
      getCase: new GetCaseUseCase(caseRepo),
      getHospitalCaseDetail: new GetHospitalCaseDetailUseCase(caseRepo, progressRepo, documentRepo, storage, patientRepo),
      updateCase: new UpdateCaseUseCase(caseRepo),
      assignCase: new AssignCaseUseCase(caseRepo, hospitalRepo, assignmentService, progressRepo),
      updateCaseStatus: new UpdateCaseStatusUseCase(caseRepo, progressRepo),
      advanceCaseStage: new AdvanceCaseStageUseCase(caseRepo, progressRepo),
      getCaseStats: new GetCaseStatsUseCase(caseRepo),
      uploadDocument: new UploadDocumentUseCase(documentRepo, caseRepo, progressRepo, storage),
      listDocuments: new ListDocumentsUseCase(documentRepo, caseRepo, storage),
      deleteDocument: new DeleteDocumentUseCase(documentRepo, caseRepo),
      getCaseProgress: new GetCaseProgressUseCase(progressRepo, caseRepo),
      addCaseProgress: new AddCaseProgressUseCase(progressRepo, caseRepo),
    };
  }
  return _services;
}
