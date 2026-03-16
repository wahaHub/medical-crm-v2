import type { ICaseEventRepository } from '@medical-crm/domain';
import type { CaseEventDTO } from '../../dtos/case-event.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseEventDTO } from '../../mappers/case-event.mapper.js';

export class ListCaseEventsUseCase {
  constructor(private readonly eventRepo: ICaseEventRepository) {}

  async execute(caseId: string, _actor: Actor): Promise<CaseEventDTO[]> {
    // ADMIN sees all events, HOSPITAL sees all events for their cases
    const events = await this.eventRepo.findByCaseId(caseId);
    return events.map(toCaseEventDTO);
  }
}
