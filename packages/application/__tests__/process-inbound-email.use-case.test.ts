import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailReplyToken, InboundEmailEvent } from '@medical-crm/domain';
import type {
  ICaseRepository,
  IConversationRepository,
  IEmailReplyTokenRepository,
  IInboundEmailEventRepository,
  IPatientRepository,
} from '@medical-crm/domain';
import {
  ProcessInboundEmailUseCase,
  type InboundAttachmentSource,
  type InboundAttachmentUploader,
  type NormalizedInboundEmailInput,
} from '../src/use-cases/inbound/process-inbound-email.use-case.js';
import {
  buildPreferredReplyAddress,
  generateReplyToken,
  hashReplyToken,
} from '../src/services/email-reply-token.service.js';

const NOW = new Date('2026-04-28T12:00:00Z');

describe('ProcessInboundEmailUseCase', () => {
  let token: string;
  let tokenEntity: EmailReplyToken;
  let email: NormalizedInboundEmailInput;
  let replyTokenRepo: IEmailReplyTokenRepository;
  let inboundEventRepo: IInboundEmailEventRepository;
  let conversationRepo: IConversationRepository;
  let caseRepo: ICaseRepository;
  let patientRepo: IPatientRepository;
  let mediaUpload: {
    createUploadIntent: ReturnType<typeof vi.fn>;
  };
  let attachmentSource: InboundAttachmentSource;
  let attachmentUploader: InboundAttachmentUploader;
  let sendMessage: {
    execute: ReturnType<typeof vi.fn>;
  };
  let useCase: ProcessInboundEmailUseCase;

  beforeEach(() => {
    token = generateReplyToken();
    tokenEntity = makeReplyToken({ tokenHash: hashReplyToken(token) });
    email = makeInboundEmail({
      to: [buildPreferredReplyAddress(token)],
      text: 'Thanks, I can make that time.\n\nOn Tue, Admin wrote:\n> earlier message',
    });

    replyTokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(tokenEntity),
      findReusable: vi.fn().mockResolvedValue(null),
      save: vi.fn(async (entity) => entity),
      markUsed: vi.fn().mockResolvedValue(undefined),
    };
    inboundEventRepo = {
      claim: vi.fn().mockResolvedValue({
        event: makeInboundEvent(),
        alreadyClaimed: false,
      }),
      complete: vi.fn().mockResolvedValue(undefined),
    };
    conversationRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'conv-1', caseId: 'case-1' }),
      findMany: vi.fn(),
      findByPatientId: vi.fn(),
      findOrCreateAdminPatientConversation: vi.fn(),
      findOrCreateHospitalPatientConversation: vi.fn(),
      save: vi.fn(),
    };
    caseRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }),
      findMany: vi.fn(),
      findByPatientId: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    patientRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'patient-1',
        patientCode: 'P-001',
        preferredLanguage: 'en',
      }),
      findByEmail: vi.fn(),
      findAuthByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn(),
    };
    mediaUpload = {
      createUploadIntent: vi.fn().mockResolvedValue({
        uploadUrl: 'https://uploads.example/asset-1',
        asset: {
          fileName: 'scan.pdf',
          fileSize: 4,
          mimeType: 'application/pdf',
          storageKey: 'communications/messages/conv-1/scan.pdf',
        },
      }),
    };
    attachmentSource = {
      getAttachmentBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    };
    attachmentUploader = {
      uploadBytes: vi.fn().mockResolvedValue(undefined),
    };
    sendMessage = {
      execute: vi.fn().mockResolvedValue({ message: { id: 'message-1' } }),
    };
    useCase = new ProcessInboundEmailUseCase({
      replyTokenRepo,
      inboundEventRepo,
      conversationRepo,
      caseRepo,
      patientRepo,
      mediaUpload,
      attachmentSource,
      attachmentUploader,
      sendMessage,
      now: () => NOW,
    });
  });

  it('valid token/sender/auth writes patient message with cleaned text', async () => {
    const result = await useCase.execute(email);

    expect(result).toEqual({
      status: 'PROCESSED',
      createdMessageId: 'message-1',
      duplicate: false,
    });
    expect(inboundEventRepo.claim).toHaveBeenCalledWith({
      provider: 'resend',
      providerEventId: 'evt-1',
      providerMessageId: 'msg-1',
    });
    expect(replyTokenRepo.findByTokenHash).toHaveBeenCalledWith(hashReplyToken(token));
    expect(sendMessage.execute).toHaveBeenCalledWith(
      'conv-1',
      {
        content: 'Thanks, I can make that time.',
        messageType: 'TEXT',
        attachments: [],
      },
      {
        userId: 'patient-1',
        email: 'patient@example.com',
        role: 'PATIENT',
        hospitalId: null,
      },
    );
    expect(replyTokenRepo.markUsed).toHaveBeenCalledWith('reply-token-1', NOW);
    expect(inboundEventRepo.complete).toHaveBeenCalledWith(expect.objectContaining({
      id: 'event-1',
      status: 'PROCESSED',
      replyTokenId: 'reply-token-1',
      conversationId: 'conv-1',
      caseId: 'case-1',
      fromEmail: 'patient@example.com',
      subject: 'Re: Treatment plan',
      createdMessageId: 'message-1',
    }));
  });

  it('valid reply with attachment uploads attachment and writes message as FILE with attachment asset', async () => {
    email = makeInboundEmail({
      to: [buildPreferredReplyAddress(token)],
      text: 'Attached.',
      attachments: [{
        providerAttachmentId: 'att-1',
        fileName: 'scan.pdf',
        mimeType: 'application/pdf',
        fileSize: 4,
      }],
    });

    const result = await useCase.execute(email);

    expect(result.status).toBe('PROCESSED');
    expect(attachmentSource.getAttachmentBytes).toHaveBeenCalledWith({
      provider: 'resend',
      providerMessageId: 'msg-1',
      providerAttachmentId: 'att-1',
    });
    expect(mediaUpload.createUploadIntent).toHaveBeenCalledWith({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv-1',
      fileName: 'scan.pdf',
      fileSize: 4,
      mimeType: 'application/pdf',
    });
    expect(attachmentUploader.uploadBytes).toHaveBeenCalledWith({
      uploadUrl: 'https://uploads.example/asset-1',
      bytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: 'application/pdf',
      label: 'scan.pdf',
    });
    expect(sendMessage.execute).toHaveBeenCalledWith(
      'conv-1',
      {
        content: 'Attached.',
        messageType: 'FILE',
        attachments: [{
          fileName: 'scan.pdf',
          fileSize: 4,
          mimeType: 'application/pdf',
          storageKey: 'communications/messages/conv-1/scan.pdf',
        }],
      },
      expect.objectContaining({ role: 'PATIENT' }),
    );
  });

  it('duplicate claimed event creates no second message', async () => {
    vi.mocked(inboundEventRepo.claim).mockResolvedValueOnce({
      event: makeInboundEvent({ status: 'PROCESSED', createdMessageId: 'message-1' }),
      alreadyClaimed: true,
    });

    const result = await useCase.execute(email);

    expect(result).toEqual({
      status: 'DUPLICATE',
      duplicate: true,
      eventId: 'event-1',
    });
    expect(sendMessage.execute).not.toHaveBeenCalled();
    expect(inboundEventRepo.complete).not.toHaveBeenCalled();
  });

  it('missing token records TOKEN_NOT_FOUND', async () => {
    email = makeInboundEmail({ to: ['care@example.com'] });

    const result = await useCase.execute(email);

    expect(result.status).toBe('TOKEN_NOT_FOUND');
    expect(replyTokenRepo.findByTokenHash).not.toHaveBeenCalled();
    expect(sendMessage.execute).not.toHaveBeenCalled();
    expect(inboundEventRepo.complete).toHaveBeenCalledWith(expect.objectContaining({
      id: 'event-1',
      status: 'TOKEN_NOT_FOUND',
      fromEmail: 'patient@example.com',
      subject: 'Re: Treatment plan',
      createdMessageId: null,
    }));
  });

  it('expired token records TOKEN_EXPIRED', async () => {
    vi.mocked(replyTokenRepo.findByTokenHash).mockResolvedValueOnce(
      makeReplyToken({
        tokenHash: hashReplyToken(token),
        expiresAt: new Date('2026-04-28T12:00:00Z'),
      }),
    );

    const result = await useCase.execute(email);

    expect(result.status).toBe('TOKEN_EXPIRED');
    expect(sendMessage.execute).not.toHaveBeenCalled();
    expect(inboundEventRepo.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'TOKEN_EXPIRED',
      replyTokenId: 'reply-token-1',
      conversationId: 'conv-1',
      caseId: 'case-1',
    }));
  });

  it('sender mismatch records SENDER_MISMATCH', async () => {
    email = makeInboundEmail({ to: [buildPreferredReplyAddress(token)], fromEmail: 'other@example.com' });

    const result = await useCase.execute(email);

    expect(result.status).toBe('SENDER_MISMATCH');
    expect(sendMessage.execute).not.toHaveBeenCalled();
    expect(inboundEventRepo.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'SENDER_MISMATCH',
      replyTokenId: 'reply-token-1',
      fromEmail: 'other@example.com',
    }));
  });

  it('failed SPF/DKIM/DMARC records EMAIL_AUTH_FAILED', async () => {
    for (const failedAuth of [
      { spf: 'fail', dkim: 'pass', dmarc: 'pass' },
      { spf: 'pass', dkim: 'fail', dmarc: 'pass' },
      { spf: 'pass', dkim: 'pass', dmarc: 'fail' },
    ]) {
      vi.clearAllMocks();
      vi.mocked(inboundEventRepo.claim).mockResolvedValue({
        event: makeInboundEvent(),
        alreadyClaimed: false,
      });

      const result = await useCase.execute(makeInboundEmail({
        to: [buildPreferredReplyAddress(token)],
        auth: failedAuth,
      }));

      expect(result.status).toBe('EMAIL_AUTH_FAILED');
      expect(sendMessage.execute).not.toHaveBeenCalled();
      expect(inboundEventRepo.complete).toHaveBeenCalledWith(expect.objectContaining({
        status: 'EMAIL_AUTH_FAILED',
      }));
    }
  });

  it('empty cleaned body and no attachments records EMPTY_REPLY', async () => {
    email = makeInboundEmail({
      to: [buildPreferredReplyAddress(token)],
      text: '\n\nOn Tue, Admin wrote:\n> earlier message',
      html: null,
      attachments: [],
    });

    const result = await useCase.execute(email);

    expect(result.status).toBe('EMPTY_REPLY');
    expect(sendMessage.execute).not.toHaveBeenCalled();
    expect(inboundEventRepo.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'EMPTY_REPLY',
      replyTokenId: 'reply-token-1',
      conversationId: 'conv-1',
      caseId: 'case-1',
    }));
  });
});

function makeReplyToken(overrides: Partial<ConstructorParameters<typeof EmailReplyToken>[0]> = {}): EmailReplyToken {
  return new EmailReplyToken({
    id: 'reply-token-1',
    tokenHash: 'token-hash',
    conversationId: 'conv-1',
    caseId: 'case-1',
    patientId: 'patient-1',
    patientEmail: 'patient@example.com',
    channel: 'ADMIN_PATIENT',
    hospitalId: null,
    sourceKind: 'message',
    sourceId: 'source-1',
    expiresAt: new Date('2026-04-29T12:00:00Z'),
    status: 'ACTIVE',
    createdAt: new Date('2026-04-27T12:00:00Z'),
    lastUsedAt: null,
    ...overrides,
  });
}

function makeInboundEmail(overrides: Partial<NormalizedInboundEmailInput> = {}): NormalizedInboundEmailInput {
  return {
    provider: 'resend',
    providerEventId: 'evt-1',
    providerMessageId: 'msg-1',
    fromEmail: 'patient@example.com',
    to: [],
    subject: 'Re: Treatment plan',
    text: 'Thanks.',
    html: null,
    headers: {},
    auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    attachments: [],
    ...overrides,
  };
}

function makeInboundEvent(
  overrides: Partial<ConstructorParameters<typeof InboundEmailEvent>[0]> = {},
): InboundEmailEvent {
  return new InboundEmailEvent({
    id: 'event-1',
    provider: 'resend',
    providerEventId: 'evt-1',
    providerMessageId: 'msg-1',
    replyTokenId: null,
    conversationId: null,
    caseId: null,
    fromEmail: null,
    subject: null,
    status: 'PROCESSING',
    error: null,
    createdMessageId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}
