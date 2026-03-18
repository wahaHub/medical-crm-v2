import type { IEmailTemplateRepository } from '@medical-crm/domain';
import { EmailTemplate } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { EmailTemplateDTO } from '../../dtos/email-template.dto.js';
import type { Actor } from '../../types/actor.js';
import { toEmailTemplateDTO } from '../../mappers/email-template.mapper.js';

export interface CreateEmailTemplateInput {
  name: string;
  type: string;
  subject: string;
  body: string;
  variables?: string[];
  status?: string;
}

export class CreateEmailTemplateUseCase {
  constructor(private readonly repo: IEmailTemplateRepository) {}

  async execute(
    hospitalId: string,
    input: CreateEmailTemplateInput,
    actor: Actor,
  ): Promise<EmailTemplateDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own templates');
    }

    const entity = new EmailTemplate({
      id: generateId(),
      hospitalId,
      name: input.name,
      type: input.type,
      subject: input.subject,
      body: input.body,
      variables: input.variables ?? [],
      status: input.status ?? 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const saved = await this.repo.save(entity);
    return toEmailTemplateDTO(saved);
  }
}
