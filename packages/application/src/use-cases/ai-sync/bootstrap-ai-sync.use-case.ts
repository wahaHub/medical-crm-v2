import type { IChatbotFaqRepository, IPackageRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { AiSyncTaskService } from '../../services/ai-sync-task.service.js';

export interface BootstrapAiSyncResult {
  faqEnqueued: number;
  packageEnqueued: number;
}

const PAGE_SIZE = 100;

export class BootstrapAiSyncUseCase {
  constructor(
    private readonly faqRepo: IChatbotFaqRepository,
    private readonly packageRepo: IPackageRepository,
    private readonly aiSyncTaskService: AiSyncTaskService,
  ) {}

  async execute(actor: Actor): Promise<BootstrapAiSyncResult> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    let faqEnqueued = 0;
    for (const hospitalType of ['COSMETIC', 'REGULAR'] as const) {
      faqEnqueued += await this.enqueueFaqsForHospitalType(hospitalType);
    }

    const packageEnqueued = await this.enqueuePublishedPackages();

    return {
      faqEnqueued,
      packageEnqueued,
    };
  }

  private async enqueueFaqsForHospitalType(hospitalType: 'COSMETIC' | 'REGULAR'): Promise<number> {
    let page = 1;
    let totalEnqueued = 0;

    while (true) {
      const result = await this.faqRepo.findAll({
        page,
        limit: PAGE_SIZE,
        hospitalType,
        hospitalId: null,
        isActive: true,
      });

      for (const faq of result.data) {
        await this.aiSyncTaskService.enqueueFaqUpsert({
          faqId: faq.id,
          category: faq.category,
          question: faq.question,
          answer: faq.answer,
          hospitalType: faq.hospitalType,
          hospitalId: faq.hospitalId,
          keywords: faq.keywords,
          attachments: faq.attachments.map((attachment) => ({
            fileName: attachment.fileName,
            storageKey: attachment.storageKey,
          })),
          isActive: faq.isActive,
        });
        totalEnqueued++;
      }

      if (result.data.length < PAGE_SIZE) {
        return totalEnqueued;
      }

      page += 1;
    }
  }

  private async enqueuePublishedPackages(): Promise<number> {
    let page = 1;
    let totalEnqueued = 0;

    while (true) {
      const result = await this.packageRepo.findAll({
        page,
        limit: PAGE_SIZE,
        status: 'PUBLISHED',
      });

      for (const pkg of result.data) {
        await this.aiSyncTaskService.enqueuePackageUpsert({
          packageId: pkg.id,
          nameEn: pkg.nameEn,
          nameZh: pkg.nameZh,
          packageType: pkg.type,
          price: pkg.price,
          currency: pkg.currency,
          descriptionEn: pkg.descriptionEn,
          descriptionZh: pkg.descriptionZh,
          inclusions: pkg.inclusions,
          status: pkg.status,
        });
        totalEnqueued++;
      }

      if (result.data.length < PAGE_SIZE) {
        return totalEnqueued;
      }

      page += 1;
    }
  }
}
