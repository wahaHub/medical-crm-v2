import type { IEmailTemplateRepository, EmailTemplateListQuery, IStorageService } from '@medical-crm/domain';
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
  constructor(
    private readonly repo: IEmailTemplateRepository,
    private readonly storageService?: IStorageService,
  ) {}

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
    let signedUrls: Record<string, string> = {};
    if (this.storageService && result.data.length > 0) {
      const keys = result.data
        .flatMap((template) => template.attachments.map((attachment) => attachment.storageKey))
        .filter(
          (storageKey) =>
            storageKey &&
            !storageKey.startsWith('http://') &&
            !storageKey.startsWith('https://') &&
            !storageKey.startsWith('data:'),
        );
      if (keys.length > 0) {
        signedUrls = await this.storageService.getSignedUrls(Array.from(new Set(keys)));
      }
    }

    return {
      data: result.data.map((template) => toEmailTemplateDTO(template, signedUrls)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
