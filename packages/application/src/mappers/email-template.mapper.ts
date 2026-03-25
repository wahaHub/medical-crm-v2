import type { EmailTemplate } from '@medical-crm/domain';
import type { EmailTemplateDTO } from '../dtos/email-template.dto.js';

function resolveAttachmentUrl(storageKey: string, signedUrls: Record<string, string>): string {
  if (
    storageKey.startsWith('http://') ||
    storageKey.startsWith('https://') ||
    storageKey.startsWith('data:')
  ) {
    return storageKey;
  }
  return signedUrls[storageKey] ?? '';
}

export function toEmailTemplateDTO(
  entity: EmailTemplate,
  signedUrls: Record<string, string> = {},
): EmailTemplateDTO {
  return {
    id: entity.id,
    hospitalId: entity.hospitalId,
    name: entity.name,
    type: entity.type,
    subject: entity.subject,
    body: entity.body,
    variables: entity.variables,
    status: entity.status,
    attachments: entity.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      storageKey: attachment.storageKey,
      url: resolveAttachmentUrl(attachment.storageKey, signedUrls),
    })),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    deletedAt: entity.deletedAt ? entity.deletedAt.toISOString() : null,
  };
}
