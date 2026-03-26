import type { ISupportTicketRepository } from '@medical-crm/domain';
import { SupportTicket, TicketNumber } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import type { SupportTicketDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO } from '../../mappers/support-ticket.mapper.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface CreateTicketInput {
  caseId?: string;
  type: string;
  priority?: string;
  subject?: string;
  description: string;
  sourcePage?: string;
}

export class CreateTicketUseCase {
  constructor(
    private readonly ticketRepo: ISupportTicketRepository,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(input: CreateTicketInput, actor: Actor): Promise<SupportTicketDTO> {
    const ticketNumberStr = await this.ticketRepo.nextTicketNumber();
    const entity = new SupportTicket({
      id: generateId(),
      ticketNumber: new TicketNumber(ticketNumberStr),
      patientId: actor.userId,
      caseId: input.caseId ?? null,
      type: input.type as import('@medical-crm/domain').TicketType,
      priority: (input.priority ?? 'MEDIUM') as import('@medical-crm/domain').TicketPriority,
      status: 'OPEN',
      subject: input.subject ?? null,
      description: input.description,
      sourcePage: input.sourcePage ?? null,
      assignedTo: null,
      slaDeadline: null,
      resolutionNote: null,
      resolvedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.ticketRepo.save(entity);

    await this.translationTaskService.enqueue({
      sourceDb: 'crm',
      entityType: 'support_ticket',
      entityId: saved.id,
      fieldsToTranslate: {
        subject: entity.subject ?? '',
        description: entity.description,
      },
    });

    return toSupportTicketDTO(saved);
  }
}
