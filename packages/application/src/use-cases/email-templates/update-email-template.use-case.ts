import type { IEmailTemplateRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { EmailTemplateDTO } from '../../dtos/email-template.dto.js';
import type { Actor } from '../../types/actor.js';
import { toEmailTemplateDTO } from '../../mappers/email-template.mapper.js';

export interface UpdateEmailTemplateInput {
  name?: string;
  type?: string;
  subject?: string;
  body?: string;
  variables?: string[];
  status?: string;
}

export class UpdateEmailTemplateUseCase {
  constructor(private readonly repo: IEmailTemplateRepository) {}

  async execute(
    id: string,
    input: UpdateEmailTemplateInput,
    actor: Actor,
  ): Promise<EmailTemplateDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const entity = await this.repo.findById(id);
    if (!entity) {
      throw new Error(`EmailTemplate not found: ${id}`);
    }

    if (actor.role === 'HOSPITAL' && actor.hospitalId !== entity.hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own templates');
    }

    entity.update(input);
    const saved = await this.repo.save(entity);
    return toEmailTemplateDTO(saved);
  }
}
