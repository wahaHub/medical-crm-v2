import type { ISupportTicketRepository, ISupportTicketReplyRepository } from '@medical-crm/domain';
import { SupportTicketReply } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { SupportTicketReplyDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketReplyDTO } from '../../mappers/support-ticket.mapper.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface ReplyToTicketInput {
  content: string;
  isInternalNote?: boolean;
  attachments?: unknown;
}

export class ReplyToTicketUseCase {
  constructor(
    private readonly ticketRepo: ISupportTicketRepository,
    private readonly replyRepo: ISupportTicketReplyRepository,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(
    ticketId: string,
    input: ReplyToTicketInput,
    actor: Actor,
  ): Promise<SupportTicketReplyDTO> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

    // Access control: patients can only reply to their own tickets
    if (actor.role !== 'ADMIN' && ticket.patientId !== actor.userId) {
      throw new ForbiddenError('Not authorized to reply to this ticket');
    }

    // Only admins can create internal notes
    const isInternalNote = actor.role === 'ADMIN' ? (input.isInternalNote ?? false) : false;

    const authorRole = actor.role === 'ADMIN' ? 'ADMIN' as const : 'PATIENT' as const;

    const reply = new SupportTicketReply({
      id: generateId(),
      ticketId,
      authorId: actor.userId,
      authorRole,
      content: input.content,
      isInternalNote,
      attachments: input.attachments ?? null,
      createdAt: new Date(),
    });

    const saved = await this.replyRepo.save(reply);

    if (!isInternalNote) {
      await this.translationTaskService.enqueue({
        sourceDb: 'crm',
        entityType: 'support_ticket_reply',
        entityId: saved.id,
        fieldsToTranslate: { content: input.content },
      });
    }

    // If patient replies to PENDING_INFO ticket, transition back to ASSIGNED
    if (actor.role !== 'ADMIN' && ticket.status === 'PENDING_INFO') {
      ticket.transitionStatus('ASSIGNED');
      await this.ticketRepo.save(ticket);
    }

    return toSupportTicketReplyDTO(saved);
  }
}
