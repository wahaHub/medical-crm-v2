import type { ICaseEventRepository, CaseEventType, ActorType } from '@medical-crm/domain';
import { CaseEvent } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import type { CaseEventDTO } from '../../dtos/case-event.dto.js';
import { toCaseEventDTO } from '../../mappers/case-event.mapper.js';

// TODO: Retrofit event recording into M1 use cases (AcceptQuote, SendQuote, etc.)
// per spec Section 2.5. Each M1 use case should call RecordCaseEventUseCase at the end.

export interface RecordCaseEventInput {
  caseId: string;
  eventType: CaseEventType;
  actorType: ActorType;
  actorId: string | null;
  eventData?: Record<string, unknown>;
  isVisibleToPatient?: boolean;
}

export class RecordCaseEventUseCase {
  constructor(private readonly eventRepo: ICaseEventRepository) {}

  async execute(input: RecordCaseEventInput): Promise<CaseEventDTO> {
    const entity = new CaseEvent({
      id: generateId(),
      caseId: input.caseId,
      eventType: input.eventType,
      actorType: input.actorType,
      actorId: input.actorId,
      eventData: input.eventData ?? null,
      isVisibleToPatient: input.isVisibleToPatient ?? false,
      createdAt: new Date(),
    });

    const saved = await this.eventRepo.save(entity);
    return toCaseEventDTO(saved);
  }
}
