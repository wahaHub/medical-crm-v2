import type { MaterialsBeforeAfterCase, MaterialsSurgeon } from '@medical-crm/domain';

type SurgeonBio = {
  intro?: string;
  expertise?: string;
  philosophy?: string;
  achievements?: string[];
} | null | undefined;

type SurgeonImages = {
  hero?: string;
} | null | undefined;

interface SurgeonRowLike {
  id: string;
  hospital_id?: string | null;
  name: string;
  title?: string | null;
  image_url?: string | null;
  experience_years?: number | null;
  specialties?: string[] | null;
  languages?: string[] | null;
  education?: string[] | null;
  certifications?: string[] | null;
  bio?: SurgeonBio;
  images?: SurgeonImages;
  translations?: Record<string, Record<string, unknown>> | null;
}

type SurgeonMutationInput = Partial<Omit<MaterialsSurgeon, 'id' | 'hospitalId'>>;

interface LegacyCaseImageRow {
  image_url: string;
  image_type?: 'before' | 'after' | 'combined' | null;
  sort_order?: number | null;
}

interface LegacyCaseMediaRow {
  media_url?: string | null;
  image_url?: string | null;
  media_type?: string | null;
  image_type?: 'before' | 'after' | 'combined' | null;
  type?: 'before' | 'after' | 'combined' | null;
  url?: string | null;
  sort_order?: number | null;
}

const DEFAULT_R2_BASE_URL = process.env.R2_BASE_URL
  ?? process.env.NEXT_PUBLIC_R2_BASE_URL
  ?? 'https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev';
const DEFAULT_CLOUDFRONT_URL = process.env.AWS_CLOUDFRONT_URL
  ?? process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL
  ?? 'https://d1wwcixye6at8o.cloudfront.net';

function toAbsoluteCaseUrl(url: string, isRegularHospital: boolean): string {
  if (!url) return url;
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  const base = isRegularHospital ? DEFAULT_CLOUDFRONT_URL : DEFAULT_R2_BASE_URL;
  if (!base) return url;
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${base}${normalizedPath}`;
}

export function shouldIgnoreCaseMediaError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();

  return (
    code === 'PGRST200'
    || code === '42703'
    || code === '42501'
    || message.includes('case_media')
    || message.includes('case_images')
    || message.includes('permission denied')
    || message.includes('does not exist')
    || message.includes('could not find the table')
  );
}

export function mapSurgeonRowToMaterialsSurgeon(
  row: SurgeonRowLike,
  hospitalId: string,
): MaterialsSurgeon {
  return {
    id: row.id,
    hospitalId: row.hospital_id ?? hospitalId,
    name: row.name,
    title: row.title ?? null,
    imageUrl: row.image_url ?? row.images?.hero ?? null,
    experienceYears: row.experience_years ?? null,
    specialties: row.specialties ?? [],
    languages: row.languages ?? [],
    education: row.education ?? [],
    certifications: row.certifications ?? [],
    intro: row.bio?.intro ?? null,
    expertise: row.bio?.expertise ?? null,
    philosophy: row.bio?.philosophy ?? null,
    achievements: row.bio?.achievements ?? [],
    translations: row.translations ?? {},
  };
}

export function buildSurgeonMutation(
  data: SurgeonMutationInput,
  existing?: { bio?: SurgeonBio; images?: SurgeonImages },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (data.name !== undefined) payload['name'] = data.name;
  if (data.title !== undefined) payload['title'] = data.title;
  if (data.imageUrl !== undefined) {
    payload['image_url'] = data.imageUrl;
    payload['images'] = data.imageUrl
      ? { ...(existing?.images ?? {}), hero: data.imageUrl }
      : {};
  }
  if (data.experienceYears !== undefined) payload['experience_years'] = data.experienceYears;
  if (data.specialties !== undefined) payload['specialties'] = data.specialties;
  if (data.languages !== undefined) payload['languages'] = data.languages;
  if (data.education !== undefined) payload['education'] = data.education;
  if (data.certifications !== undefined) payload['certifications'] = data.certifications;

  if (
    data.intro !== undefined ||
    data.expertise !== undefined ||
    data.philosophy !== undefined ||
    data.achievements !== undefined
  ) {
    payload['bio'] = {
      ...(existing?.bio ?? {}),
      ...(data.intro !== undefined ? { intro: data.intro ?? undefined } : {}),
      ...(data.expertise !== undefined ? { expertise: data.expertise ?? undefined } : {}),
      ...(data.philosophy !== undefined ? { philosophy: data.philosophy ?? undefined } : {}),
      ...(data.achievements !== undefined ? { achievements: data.achievements } : {}),
    };
  }

  return payload;
}

function sortByOrder<T extends { sort_order?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function buildLegacyCaseImageUrl({
  procedureSlug,
  caseNumber,
  hospitalId,
  isRegularHospital,
}: {
  procedureSlug: string;
  caseNumber: string;
  hospitalId: string;
  isRegularHospital: boolean;
}): string {
  if (isRegularHospital) {
    const base = DEFAULT_CLOUDFRONT_URL || '';
    const path = `/hospital_photos/public/${hospitalId}/cases/${procedureSlug}/case-${caseNumber}-1.jpg`;
    return `${base}${path}`;
  }

  const base = DEFAULT_R2_BASE_URL || '';
  const path = `/hospitals/${hospitalId}/cases/${procedureSlug}/case-${caseNumber}-1.png`;
  return `${base}${path}`;
}

export function mapCaseAssetsToImages({
  caseRow,
  caseImages,
  caseMedia,
  procedureSlug,
  caseNumber,
  hospitalId,
  isRegularHospital = false,
}: {
  caseRow?: Record<string, unknown> | null;
  caseImages?: LegacyCaseImageRow[] | null;
  caseMedia?: LegacyCaseMediaRow[] | null;
  procedureSlug?: string | null;
  caseNumber?: string | null;
  hospitalId?: string | null;
  isRegularHospital?: boolean;
}): MaterialsBeforeAfterCase['images'] {
  const isImageType = (value?: string | null): boolean => {
    const mediaType = value?.toLowerCase();
    return mediaType === 'image'
      || mediaType === 'photo'
      || mediaType === 'before'
      || mediaType === 'after'
      || mediaType === 'combined';
  };

  const orderedCaseImages = sortByOrder(caseImages ?? []);
  if (orderedCaseImages.length > 0) {
    return orderedCaseImages.map((img) => ({
      url: toAbsoluteCaseUrl(img.image_url, isRegularHospital),
    }));
  }

  const orderedMediaImages = sortByOrder(caseMedia ?? []);

  const typedMediaImages = orderedMediaImages
    .map((item) => {
      const directUrl = item.image_url ?? item.media_url ?? item.url;
      if (item.image_url && directUrl) {
        return { url: toAbsoluteCaseUrl(directUrl, isRegularHospital) };
      }

      const directType = item.image_type ?? item.type;
      if (directUrl && isImageType(directType)) {
        return { url: toAbsoluteCaseUrl(directUrl, isRegularHospital) };
      }

      const mediaType = item.media_type?.toLowerCase();
      if (isImageType(mediaType) && directUrl) {
        return { url: toAbsoluteCaseUrl(directUrl, isRegularHospital) };
      }

      return null;
    })
    .filter((item): item is { url: string } => item !== null);

  if (typedMediaImages.length > 0) {
    return typedMediaImages;
  }

  const mediaItemsValue = caseRow?.mediaItems ?? caseRow?.media_items;
  const mediaItems = Array.isArray(mediaItemsValue) ? mediaItemsValue : [];
  const typedMediaItems = mediaItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as LegacyCaseMediaRow;
      const url = row.url ?? row.image_url ?? row.media_url;
      const type = row.type ?? row.image_type ?? row.media_type;
      if (!url || (type && !isImageType(type))) return null;
      return { url: toAbsoluteCaseUrl(url, isRegularHospital) };
    })
    .filter((item): item is { url: string } => item !== null);

  const combinedImage = caseRow?.before_after_image ?? caseRow?.beforeAfterImage;
  if (typeof combinedImage === 'string' && combinedImage.trim().length > 0) {
    typedMediaItems.push({ url: toAbsoluteCaseUrl(combinedImage, isRegularHospital) });
  }

  if (typedMediaItems.length > 0) {
    const seen = new Set<string>();
    return typedMediaItems.filter((item) => {
      const key = item.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (procedureSlug && caseNumber && hospitalId) {
    return [{
      url: buildLegacyCaseImageUrl({
        procedureSlug,
        caseNumber,
        hospitalId,
        isRegularHospital,
      }),
    }];
  }

  return [];
}

export function slugifyProcedureName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
