import type { IEmailTemplateRepository, EmailTemplateListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { EmailTemplateDTO } from '../../dtos/email-template.dto.js';
import type { Actor } from '../../types/actor.js';
import { toEmailTemplateDTO } from '../../mappers/email-template.mapper.js';

export interface EmailTemplateListQueryInput {
  page: number;
  limit: number;
  type?: string;
  status?: string;
}

export class ListEmailTemplatesUseCase {
  constructor(private readonly repo: IEmailTemplateRepository) {}

  async execute(
    hospitalId: string,
    query: EmailTemplateListQueryInput,
    actor: Actor,
  ): Promise<{ data: EmailTemplateDTO[]; total: number; page: number; limit: number }> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own templates');
    }

    const result = await this.repo.findByHospital(hospitalId, query as EmailTemplateListQuery);

    return {
      data: result.data.map((e) => toEmailTemplateDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
