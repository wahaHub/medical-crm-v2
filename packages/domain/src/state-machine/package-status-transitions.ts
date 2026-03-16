import type { PackageStatus } from '../enums/index.js';

export const PACKAGE_STATUS_TRANSITIONS: Record<PackageStatus, PackageStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['DRAFT'],  // can unpublish back to draft
};
