import { EmailReplyToken, type EmailReplyChannel, type IEmailReplyTokenRepository } from '@medical-crm/domain';
import { generateId, ValidationError } from '@medical-crm/utils';
import {
  buildPreferredReplyAddress,
  generateReplyToken,
  hashReplyToken,
} from '../../services/email-reply-token.service.js';

export interface CreateEmailReplyTokenInput {
  conversationId: string;
  caseId: string;
  patientId: string;
  patientEmail: string;
  channel: EmailReplyChannel;
  hospitalId?: string | null;
  sourceKind: string;
  sourceId?: string | null;
}

export interface CreateEmailReplyTokenResult {
  replyTo: string;
}

const REPLY_TOKEN_TTL_DAYS = 180;

export class CreateEmailReplyTokenUseCase {
  constructor(private readonly repo: IEmailReplyTokenRepository) {}

  async execute(input: CreateEmailReplyTokenInput): Promise<CreateEmailReplyTokenResult> {
    const hospitalId = input.hospitalId ?? null;
    if (input.channel === 'HOSPITAL_PATIENT' && !hospitalId) {
      throw new ValidationError('HOSPITAL_PATIENT reply tokens require hospitalId');
    }

    const now = new Date();
    await this.repo.findReusable({
      conversationId: input.conversationId,
      patientId: input.patientId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId ?? null,
      now,
    });

    const rawToken = generateReplyToken();
    const expiresAt = new Date(now.getTime() + REPLY_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const entity = new EmailReplyToken({
      id: generateId(),
      tokenHash: hashReplyToken(rawToken),
      conversationId: input.conversationId,
      caseId: input.caseId,
      patientId: input.patientId,
      patientEmail: input.patientEmail,
      channel: input.channel,
      hospitalId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId ?? null,
      expiresAt,
      status: 'ACTIVE',
      createdAt: now,
      lastUsedAt: null,
    });

    await this.repo.save(entity);

    return {
      replyTo: `Medora Reply <${buildPreferredReplyAddress(rawToken)}>`,
    };
  }
}
