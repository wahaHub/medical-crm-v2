export interface PackageDTO {
  id: string;
  nameEn: string;
  nameZh: string | null;
  type: string;
  price: string;
  currency: string;
  descriptionEn: string | null;
  descriptionZh: string | null;
  inclusions: unknown;
  coverImageUrl: string | null;
  sortWeight: number;
  status: string;
  publishAt: string | null;
  takedownAt: string | null;
  config: unknown;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
