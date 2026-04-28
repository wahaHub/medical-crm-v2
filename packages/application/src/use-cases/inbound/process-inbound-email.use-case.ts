import type {
  Attachment,
  ICaseRepository,
  IConversationRepository,
  IEmailReplyTokenRepository,
  IInboundEmailEventRepository,
  InboundEmailClaimInput,
  InboundEmailProvider,
  InboundEmailStatus,
  IPatientRepository,
} from '@medical-crm/domain';
import { parseReplyAddress } from '../../services/email-reply-token.service.js';
import { parseEmailReplyBody } from '../../services/email-reply-body-parser.js';
import type { Actor } from '../../types/actor.js';
import type { SendMessageInput } from '../messages/send-message.use-case.js';

export interface NormalizedInboundEmailInput {
  provider: InboundEmailProvider;
  providerEventId: string | null;
  providerMessageId: string | null;
  fromEmail: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  auth?: {
    spf?: string | null;
    dkim?: string | null;
    dmarc?: string | null;
  } | null;
  attachments: NormalizedInboundAttachmentInput[];
}

export interface NormalizedInboundAttachmentInput {
  providerAttachmentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface InboundAttachmentSource {
  getAttachmentBytes(input: {
    provider: InboundEmailProvider;
    providerMessageId: string;
    providerAttachmentId: string;
  }): Promise<Uint8Array>;
}

export interface InboundAttachmentUploader {
  uploadBytes(input: {
    uploadUrl: string;
    bytes: Uint8Array;
    mimeType: string;
    label: string;
  }): Promise<void>;
}

export interface InboundMediaUploadService {
  createUploadIntent(input: {
    policyId: 'message_attachment';
    ownerType: 'conversation';
    ownerId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }): Promise<{
    uploadUrl: string;
    asset: Attachment;
  }>;
}

export interface InboundSendMessageUseCase {
  execute(conversationId: string, input: SendMessageInput, actor: Actor): Promise<unknown>;
}

export interface ProcessInboundEmailUseCaseDeps {
  replyTokenRepo: IEmailReplyTokenRepository;
  inboundEventRepo: IInboundEmailEventRepository;
  conversationRepo: IConversationRepository;
  caseRepo: ICaseRepository;
  patientRepo: IPatientRepository;
  mediaUpload: InboundMediaUploadService;
  attachmentSource: InboundAttachmentSource;
  attachmentUploader: InboundAttachmentUploader;
  sendMessage: InboundSendMessageUseCase;
  now?: () => Date;
}

export type ProcessInboundEmailResult =
  | {
      status: InboundEmailStatus;
      duplicate: false;
      createdMessageId?: string | null;
    }
  | {
      status: InboundEmailStatus;
      duplicate: true;
      eventId: string;
      createdMessageId?: string | null;
    };

export class ProcessInboundEmailUseCase {
  private readonly replyTokenRepo: IEmailReplyTokenRepository;
  private readonly inboundEventRepo: IInboundEmailEventRepository;
  private readonly conversationRepo: IConversationRepository;
  private readonly caseRepo: ICaseRepository;
  private readonly patientRepo: IPatientRepository;
  private readonly mediaUpload: InboundMediaUploadService;
  private readonly attachmentSource: InboundAttachmentSource;
  private readonly attachmentUploader: InboundAttachmentUploader;
  private readonly sendMessage: InboundSendMessageUseCase;
  private readonly now: () => Date;

  constructor(deps: ProcessInboundEmailUseCaseDeps) {
    this.replyTokenRepo = deps.replyTokenRepo;
    this.inboundEventRepo = deps.inboundEventRepo;
    this.conversationRepo = deps.conversationRepo;
    this.caseRepo = deps.caseRepo;
    this.patientRepo = deps.patientRepo;
    this.mediaUpload = deps.mediaUpload;
    this.attachmentSource = deps.attachmentSource;
    this.attachmentUploader = deps.attachmentUploader;
    this.sendMessage = deps.sendMessage;
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: NormalizedInboundEmailInput): Promise<ProcessInboundEmailResult> {
    const claim = await this.inboundEventRepo.claim(toClaimInput(input));

    if (claim.alreadyClaimed) {
      if (claim.event.status !== 'FAILED') {
        return {
          status: claim.event.status,
          duplicate: true,
          eventId: claim.event.id,
          ...(claim.event.createdMessageId ? { createdMessageId: claim.event.createdMessageId } : {}),
        };
      }
    }

    try {
      return await this.processClaimedEvent(claim.event.id, input);
    } catch (error) {
      await this.inboundEventRepo.complete({
        id: claim.event.id,
        status: 'FAILED',
        fromEmail: input.fromEmail,
        subject: input.subject,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async processClaimedEvent(
    eventId: string,
    input: NormalizedInboundEmailInput,
  ): Promise<ProcessInboundEmailResult> {
    const parsedAddress = input.to
      .map((address) => parseReplyAddress(address))
      .find((parsed) => parsed !== null);

    if (!parsedAddress) {
      return await this.completeHandled(eventId, 'TOKEN_NOT_FOUND', input);
    }

    const token = await this.replyTokenRepo.findByTokenHash(parsedAddress.tokenHash);
    if (!token) {
      return await this.completeHandled(eventId, 'TOKEN_NOT_FOUND', input);
    }

    if (token.status !== 'ACTIVE' || token.expiresAt <= this.now()) {
      return await this.completeHandled(eventId, 'TOKEN_EXPIRED', input, {
        replyTokenId: token.id,
        conversationId: token.conversationId,
        caseId: token.caseId,
      });
    }

    if (normalizeEmail(input.fromEmail) !== normalizeEmail(token.patientEmail)) {
      return await this.completeHandled(eventId, 'SENDER_MISMATCH', input, {
        replyTokenId: token.id,
        conversationId: token.conversationId,
        caseId: token.caseId,
      });
    }

    if (hasFailedAuth(input.auth)) {
      return await this.completeHandled(eventId, 'EMAIL_AUTH_FAILED', input, {
        replyTokenId: token.id,
        conversationId: token.conversationId,
        caseId: token.caseId,
      });
    }

    const conversation = await this.conversationRepo.findById(token.conversationId);
    const caseEntity = await this.caseRepo.findById(token.caseId);
    const patient = await this.patientRepo.findById(token.patientId);
    if (
      !conversation ||
      conversation.id !== token.conversationId ||
      conversation.caseId !== token.caseId ||
      conversation.category !== token.channel ||
      (token.channel === 'HOSPITAL_PATIENT' && conversation.hospitalId !== token.hospitalId) ||
      !caseEntity ||
      caseEntity.id !== token.caseId ||
      caseEntity.patientId !== token.patientId ||
      !patient ||
      patient.id !== token.patientId
    ) {
      return await this.completeHandled(eventId, 'CONVERSATION_INVALID', input, {
        replyTokenId: token.id,
        conversationId: token.conversationId,
        caseId: token.caseId,
      });
    }

    const content = parseEmailReplyBody(input);
    if (!content && input.attachments.length === 0) {
      return await this.completeHandled(eventId, 'EMPTY_REPLY', input, {
        replyTokenId: token.id,
        conversationId: token.conversationId,
        caseId: token.caseId,
      });
    }

    if (!input.providerMessageId && input.attachments.length > 0) {
      return await this.completeHandled(eventId, 'FAILED', input, {
        replyTokenId: token.id,
        conversationId: token.conversationId,
        caseId: token.caseId,
        error: 'Inbound email with attachments is missing providerMessageId',
      });
    }

    const attachmentUpload = await this.uploadAttachments(input, token.conversationId);
    if ('error' in attachmentUpload) {
      return await this.completeHandled(eventId, 'FAILED', input, {
        replyTokenId: token.id,
        conversationId: token.conversationId,
        caseId: token.caseId,
        error: attachmentUpload.error,
      });
    }
    const attachments = attachmentUpload.attachments;
    const sendResult = await this.sendMessage.execute(
      token.conversationId,
      {
        content: content || 'Uploaded attachments',
        messageType: attachments.length > 0 ? 'FILE' : 'TEXT',
        attachments,
      },
      {
        userId: token.patientId,
        email: token.patientEmail,
        role: 'PATIENT',
        hospitalId: null,
      },
    );
    const createdMessageId = extractCreatedMessageId(sendResult);

    await this.replyTokenRepo.markUsed(token.id, this.now());
    await this.inboundEventRepo.complete({
      id: eventId,
      status: 'PROCESSED',
      replyTokenId: token.id,
      conversationId: token.conversationId,
      caseId: token.caseId,
      fromEmail: input.fromEmail,
      subject: input.subject,
      createdMessageId,
      error: null,
    });

    return {
      status: 'PROCESSED',
      duplicate: false,
      createdMessageId,
    };
  }

  private async uploadAttachments(
    input: NormalizedInboundEmailInput,
    conversationId: string,
  ): Promise<{ attachments: Attachment[] } | { error: string }> {
    const uploaded: Attachment[] = [];

    for (const attachment of input.attachments) {
      const intent = await this.mediaUpload.createUploadIntent({
        policyId: 'message_attachment',
        ownerType: 'conversation',
        ownerId: conversationId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
      });
      const bytes = await this.attachmentSource.getAttachmentBytes({
        provider: input.provider,
        providerMessageId: input.providerMessageId!,
        providerAttachmentId: attachment.providerAttachmentId,
      });

      if (bytes.byteLength !== attachment.fileSize) {
        return {
          error: `Inbound attachment size mismatch for ${attachment.fileName}: expected ${attachment.fileSize} bytes, received ${bytes.byteLength} bytes`,
        };
      }

      await this.attachmentUploader.uploadBytes({
        uploadUrl: intent.uploadUrl,
        bytes,
        mimeType: attachment.mimeType,
        label: attachment.fileName,
      });
      uploaded.push(intent.asset);
    }

    return { attachments: uploaded };
  }

  private async completeHandled(
    eventId: string,
    status: InboundEmailStatus,
    input: NormalizedInboundEmailInput,
    context: {
      replyTokenId?: string | null;
      conversationId?: string | null;
      caseId?: string | null;
      error?: string | null;
    } = {},
  ): Promise<ProcessInboundEmailResult> {
    await this.inboundEventRepo.complete({
      id: eventId,
      status,
      replyTokenId: context.replyTokenId,
      conversationId: context.conversationId,
      caseId: context.caseId,
      fromEmail: input.fromEmail,
      subject: input.subject,
      createdMessageId: null,
      error: context.error ?? null,
    });

    return {
      status,
      duplicate: false,
      createdMessageId: null,
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toClaimInput(input: NormalizedInboundEmailInput): InboundEmailClaimInput {
  if (input.providerEventId) {
    return {
      provider: input.provider,
      providerEventId: input.providerEventId,
      providerMessageId: input.providerMessageId,
    };
  }

  if (input.providerMessageId) {
    return {
      provider: input.provider,
      providerMessageId: input.providerMessageId,
    };
  }

  throw new Error('Inbound email is missing providerEventId and providerMessageId');
}

function hasFailedAuth(auth: NormalizedInboundEmailInput['auth']): boolean {
  return [auth?.spf, auth?.dkim, auth?.dmarc].some(
    (value) => value?.trim().toLowerCase() === 'fail',
  );
}

function extractCreatedMessageId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  if ('message' in value) {
    const message = value.message;
    if (message && typeof message === 'object' && 'id' in message && typeof message.id === 'string') {
      return message.id;
    }
  }

  if ('id' in value && typeof value.id === 'string') {
    return value.id;
  }

  return null;
}
