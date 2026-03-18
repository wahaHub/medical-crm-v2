import type { EmailTemplate } from '@medical-crm/domain';
import type { EmailTemplateDTO } from '../dtos/email-template.dto.js';

export function toEmailTemplateDTO(entity: EmailTemplate): EmailTemplateDTO {
  return {
    id: entity.id,
    hospitalId: entity.hospitalId,
    name: entity.name,
    type: entity.type,
    subject: entity.subject,
    body: entity.body,
    variables: entity.variables,
    status: entity.status,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    deletedAt: entity.deletedAt ? entity.deletedAt.toISOString() : null,
  };
}
