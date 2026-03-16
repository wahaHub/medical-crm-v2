import type { Package } from '../entities/package.entity.js';

export interface PackageListQuery {
  status?: string;
  type?: string;
  page: number;
  limit: number;
}

export interface IPackageRepository {
  findById(id: string, tx?: unknown): Promise<Package | null>;
  findAll(query: PackageListQuery): Promise<{ data: Package[]; total: number }>;
  save(entity: Package, tx?: unknown): Promise<Package>;
}
