import { ForbiddenError, ValidationError } from '@medical-crm/utils';
import type { IConsultationRepository, ConsultationStatus } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';

export class ListConsultationsUseCase {
  constructor(private readonly consultationRepo: IConsultationRepository) {}

  async execute(
    query: { cursor?: string; limit?: number; status?: ConsultationStatus },
    actor: Actor,
  ): Promise<{ data: ConsultationDTO[]; nextCursor: string | null; hasMore: boolean }> {
    if (actor.role !== 'HOSPITAL') throw new ForbiddenError('Only hospital users can list consultations');

    const parsedCursor = query.cursor ? this.parseCursor(query.cursor) : undefined;
    const result = await this.consultationRepo.findMany({
      cursor: parsedCursor,
      limit: query.limit ?? 20,
      hospitalId: actor.hospitalId!,
      status: query.status,
    });

    return {
      data: result.data.map(toConsultationDTO),
      nextCursor: result.nextCursor ? `${result.nextCursor.scheduledAt}_${result.nextCursor.id}` : null,
      hasMore: result.hasMore,
    };
  }

  private parseCursor(cursor: string): { scheduledAt: string; id: string } {
    const [scheduledAt, id] = cursor.split('_');
    if (!scheduledAt || !id) throw new ValidationError('Invalid cursor format');
    return { scheduledAt, id };
  }
}
