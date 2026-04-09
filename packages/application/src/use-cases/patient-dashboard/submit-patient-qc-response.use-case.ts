import type {
  IQuestionCollectorRepository,
  ICaseRepository,
  IAiChatSessionRepository,
  IAiChatMessageRepository,
  TransactionRunner,
  Transaction,
} from '@medical-crm/domain';
import { AiChatMessage, AiChatSession, QCResponse } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError, ConflictError } from '@medical-crm/utils';
import { asRecord } from '../../utils/structured-data.js';
import type { MedicalFormStatus } from '../../utils/structured-data.js';
import type { QCResponseDTO } from '../../dtos/question-collector.dto.js';
import { toQCResponseDTO } from '../../mappers/question-collector.mapper.js';

export interface SubmitPatientQCResponseInput {
  caseId: string;
  patientId: string;
  templateId: string;
  responses: unknown;
}

export class SubmitPatientQCResponseUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly aiChatSessionRepo: IAiChatSessionRepository,
    private readonly aiChatMessageRepo: IAiChatMessageRepository,
    private readonly txRunner: TransactionRunner,
  ) {}

  async execute(input: SubmitPatientQCResponseInput): Promise<QCResponseDTO> {
    return this.txRunner.run(async (tx: Transaction) => {
      const caseEntity = await this.caseRepo.findById(input.caseId, tx);
      if (!caseEntity) {
        throw new NotFoundError(`Case ${input.caseId} not found`);
      }
      if (caseEntity.patientId !== input.patientId) {
        throw new ForbiddenError('Access denied to this case');
      }

      // Verify template exists
      const template = await this.qcRepo.findTemplateById(input.templateId);
      if (!template || !template.isActive) {
        throw new NotFoundError(`Template ${input.templateId} not found`);
      }

      // Prevent resubmission once the medical form has already been submitted
      const existingSelection = asRecord(caseEntity.structuredData?.['patientHospitalSelection']);
      if (existingSelection?.['medicalFormStatus'] === 'SUBMITTED') {
        throw new ConflictError('Medical form has already been submitted for this case');
      }

      // Translation is not enqueued here — the admin can trigger translation separately;
      // patient medical form answers are stored as-is.

      // Persist QC response
      let entity = await this.qcRepo.findResponseByCaseId(input.caseId);

      if (entity) {
        entity.submit(input.responses, undefined, undefined);
      } else {
        entity = new QCResponse({
          id: generateId(),
          caseId: input.caseId,
          templateId: input.templateId,
          userId: input.patientId,
          responses: input.responses,
          extractedData: null,
          riskFlags: [],
          completionStatus: 'COMPLETED',
          submittedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const saved = await this.qcRepo.saveResponse(entity);

      // Update case structured data: medicalFormStatus = SUBMITTED
      const now = new Date();
      const newStatus: MedicalFormStatus = 'SUBMITTED';
      caseEntity.structuredData = {
        ...(caseEntity.structuredData ?? {}),
        patientHospitalSelection: {
          ...existingSelection,
          medicalFormStatus: newStatus,
          medicalFormSubmittedAt: now.toISOString(),
          medicalFormResponseId: saved.id,
          medicalFormSkippedAt: undefined,
        },
      };
      await this.caseRepo.save(caseEntity, tx);

      await this.persistWidgetQuestionnaireConfirmation({
        caseId: input.caseId,
        patientId: input.patientId,
        templateId: input.templateId,
        submittedAt: now,
        tx,
      });

      return toQCResponseDTO(saved);
    });
  }

  private async persistWidgetQuestionnaireConfirmation(input: {
    caseId: string;
    patientId: string;
    templateId: string;
    submittedAt: Date;
    tx: Transaction;
  }): Promise<void> {
    const widgetSessionId = buildWidgetSessionId(input.patientId, input.caseId);
    let widgetSession = await this.aiChatSessionRepo.findBySessionId(widgetSessionId, input.tx);
    if (!widgetSession) {
      widgetSession = await this.aiChatSessionRepo.save(new AiChatSession({
        id: generateId(),
        sessionId: widgetSessionId,
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: input.patientId,
        hospitalType: 'REGULAR',
        status: 'ACTIVE',
        createdAt: input.submittedAt,
        updatedAt: input.submittedAt,
      }), input.tx);
    } else if (!widgetSession.patientId) {
      widgetSession = (await this.aiChatSessionRepo.attachPatient(widgetSession.sessionId, input.patientId, input.tx)) ?? widgetSession;
    }

    await this.aiChatMessageRepo.create(new AiChatMessage({
      id: generateId(),
      sessionId: widgetSession.id,
      role: 'SYSTEM',
      content: QUESTIONNAIRE_CONFIRMATION_MESSAGE,
      intent: null,
      resolvedIntent: null,
      riskLevel: null,
      canAnswer: null,
      nextAction: null,
      citations: [],
      metadata: {
        eventType: 'QUESTIONNAIRE_SUBMITTED',
        caseId: input.caseId,
        patientId: input.patientId,
        templateId: input.templateId,
      },
      createdAt: input.submittedAt,
    }), input.tx);

    await this.aiChatSessionRepo.patchStatus(widgetSessionId, {
      formStatus: 'COMPLETED',
      lastAssistantMessageAt: input.submittedAt,
    }, input.tx);
  }
}

const QUESTIONNAIRE_CONFIRMATION_MESSAGE = 'Your medical intake form has been submitted successfully. The care team will review it shortly.';

function buildWidgetSessionId(patientId: string, caseId: string): string {
  return `widget-chat:${patientId}:${caseId}`;
}
