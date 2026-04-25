export type DepartmentStatsInput = Record<string, {
  specialists?: number | null;
  annualPatients?: number | null;
}>;

type StoredReviewMedia = {
  id?: string;
  type?: 'image' | 'video';
  url?: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
  sortOrder?: number | null;
};

type StoredHospitalReview = {
  id?: string;
  sortOrder?: number | null;
  isActive?: boolean | null;
  featured?: boolean | null;
  patientName?: string | null;
  patientCountry?: string | null;
  patientAvatarUrl?: string | null;
  treatmentName?: string | null;
  reviewTitle?: string | null;
  reviewComment?: string | null;
  rating?: number | null;
  reviewDate?: string | null;
  media?: StoredReviewMedia[] | null;
  translations?: Record<string, Record<string, unknown>> | null;
};

type StoredPackageTag = {
  id?: string;
  label?: string | null;
  category?: string | null;
};

type StoredPackageInclude = {
  id?: string;
  text?: string | null;
  sortOrder?: number | null;
};

type StoredPackageProcess = {
  id?: string;
  stepTitle?: string | null;
  description?: string | null;
  sortOrder?: number | null;
};

type StoredPackageCase = {
  id?: string;
  patientName?: string | null;
  patientAge?: number | null;
  patientCountry?: string | null;
  story?: string | null;
  result?: string | null;
  sortOrder?: number | null;
};

type StoredPackageReview = {
  id?: string;
  reviewerName?: string | null;
  reviewerCountry?: string | null;
  rating?: number | null;
  reviewDate?: string | null;
  comment?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
};

type StoredPackageGallery = {
  id?: string;
  imageUrl?: string | null;
  sortOrder?: number | null;
};

type StoredPackage = {
  id?: string;
  slug?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  title?: string | null;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  gallery?: StoredPackageGallery[] | null;
  price?: string | null;
  currency?: string | null;
  duration?: string | null;
  summary?: string | null;
  tags?: StoredPackageTag[] | null;
  includes?: StoredPackageInclude[] | null;
  process?: StoredPackageProcess[] | null;
  cases?: StoredPackageCase[] | null;
  reviews?: StoredPackageReview[] | null;
  translations?: Record<string, Record<string, unknown>> | null;
};

type HospitalIdentity = {
  id?: string;
  slug?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
};

function sortByOrder<T extends { sortOrder?: number | null }>(items: T[] | null | undefined) {
  return [...(items ?? [])].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
}

const TAG_PRIORITY: Record<string, number> = {
  treatment: 0,
  service: 1,
  audience: 2,
  city: 3,
  price: 4,
  style: 5,
};

function sortTags(items: StoredPackageTag[] | null | undefined) {
  return [...(items ?? [])].sort((left, right) => {
    const leftPriority = TAG_PRIORITY[left.category ?? ''] ?? 99;
    const rightPriority = TAG_PRIORITY[right.category ?? ''] ?? 99;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return (left.label ?? '').localeCompare(right.label ?? '');
  });
}

function normalizeLocale(locale: string) {
  return locale.trim().toLowerCase().replace(/_/g, '-');
}

function getLocalizedFields(
  translations: Record<string, Record<string, unknown>> | null | undefined,
  locale?: string,
) {
  if (!locale) return undefined;

  const normalizedLocale = normalizeLocale(locale);
  const candidates = [
    normalizedLocale,
    normalizedLocale.split('-')[0],
    normalizedLocale === 'zh' ? undefined : 'zh',
    normalizedLocale === 'en' ? undefined : 'en',
  ]
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);

  for (const candidate of candidates) {
    const entry = Object.entries(translations ?? {}).find(([translationLocale]) => normalizeLocale(translationLocale) === candidate);
    if (entry) {
      return entry[1];
    }
  }

  return undefined;
}

function pickLocalizedText(baseValue: string | null | undefined, translatedValue: unknown) {
  if (typeof translatedValue === 'string' && translatedValue.trim().length > 0) {
    return translatedValue;
  }

  return baseValue ?? '';
}

function pickLocalizedOptionalText(baseValue: string | null | undefined, translatedValue: unknown) {
  if (typeof translatedValue === 'string' && translatedValue.trim().length > 0) {
    return translatedValue;
  }

  return baseValue ?? undefined;
}

function pickLocalizedNumber(baseValue: number | null | undefined, translatedValue: unknown) {
  if (typeof translatedValue === 'number' && Number.isFinite(translatedValue)) {
    return translatedValue;
  }

  return baseValue ?? 0;
}

function mergeLocalizedRecord<T extends Record<string, unknown>>(base: T, translated: Record<string, unknown> | null | undefined): T {
  if (!translated) {
    return base;
  }

  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => {
      const translatedValue = translated[key];
      if (translatedValue === undefined || translatedValue === null || translatedValue === '') {
        return [key, value];
      }
      return [key, translatedValue];
    }),
  ) as T;
}

function getLocalizedArray(
  localized: Record<string, unknown> | undefined,
  key: string,
): Array<Record<string, unknown> | null | undefined> {
  const value = localized?.[key];
  return Array.isArray(value) ? value as Array<Record<string, unknown> | null | undefined> : [];
}

function getLocalizedItemByIdOrIndex(
  localized: Record<string, unknown> | undefined,
  key: string,
  itemId: string | null | undefined,
  index: number,
) {
  const localizedItems = getLocalizedArray(localized, key);
  if (itemId) {
    const matched = localizedItems.find((entry) => entry?.id === itemId);
    if (matched) {
      return matched;
    }
  }

  return localizedItems[index];
}

function formatNumber(value: string | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value ?? '';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
}

export function sanitizeDepartmentStats(
  stats: DepartmentStatsInput | null | undefined,
): Record<string, { specialists?: number; annualPatients?: number }> {
  if (!stats) return {};

  return Object.fromEntries(
    Object.entries(stats).map(([department, value]) => [
      department,
      {
        ...(typeof value?.specialists === 'number' ? { specialists: value.specialists } : {}),
        ...(typeof value?.annualPatients === 'number' ? { annualPatients: value.annualPatients } : {}),
      },
    ]),
  );
}

export function mapHospitalReviewsToPatientReviews(reviews: StoredHospitalReview[] | null | undefined, locale?: string) {
  return sortByOrder(reviews)
    .filter((review) => review.isActive ?? true)
    .map((review) => {
      const localized = getLocalizedFields(review.translations, locale) as Record<string, unknown> | undefined;

      return {
        id: review.id ?? '',
        name: pickLocalizedText(review.patientName, localized?.patientName),
        country: pickLocalizedText(review.patientCountry, localized?.patientCountry),
        avatar: pickLocalizedOptionalText(review.patientAvatarUrl, localized?.patientAvatarUrl) ?? '',
        rating: pickLocalizedNumber(review.rating, localized?.rating),
        date: pickLocalizedText(review.reviewDate, localized?.reviewDate),
        treatment: pickLocalizedText(review.treatmentName, localized?.treatmentName),
        title: pickLocalizedText(review.reviewTitle, localized?.reviewTitle),
        comment: pickLocalizedText(review.reviewComment, localized?.reviewComment),
        featured: review.featured ?? false,
        media: sortByOrder(review.media)
          .map((item, index) => {
            const localizedMedia = getLocalizedArray(localized, 'media')[index];

            return {
              id: item.id ?? '',
              type: (localizedMedia?.type as 'image' | 'video' | undefined) ?? item.type ?? 'image',
              url: pickLocalizedText(item.url, localizedMedia?.url),
              thumb: pickLocalizedOptionalText(item.thumbnailUrl, localizedMedia?.thumbnailUrl),
              caption: pickLocalizedOptionalText(item.caption, localizedMedia?.caption),
            };
          })
          .filter((item) => item.url),
      };
    });
}

export function mapHospitalPackagesToPackageList(packages: StoredPackage[] | null | undefined, locale?: string) {
  return sortByOrder(packages)
    .filter((item) => item.isActive ?? true)
    .map((item) => {
      const localized = getLocalizedFields(item.translations, locale) as Record<string, unknown> | undefined;

      return {
        id: item.id ?? '',
        slug: item.slug ?? '',
        title: pickLocalizedText(item.title, localized?.title),
        subtitle: pickLocalizedText(item.subtitle, localized?.subtitle),
        coverImage: item.coverImageUrl ?? '',
        priceUSD: formatNumber(item.price),
        duration: item.duration ?? '',
        tags: sortTags(item.tags)
          .filter((tag) => tag.label)
          .map((tag) => ({
            label: tag.label ?? '',
            category: tag.category ?? '',
          })),
        caseCount: (item.cases ?? []).length,
        reviewCount: (item.reviews ?? []).filter((review) => review.isActive ?? true).length,
        isActive: item.isActive ?? false,
      };
    });
}

export function mapHospitalPackageToPackageDetail(input: {
  hospital: HospitalIdentity;
  packageItem: StoredPackage;
  locale?: string;
}) {
  const { hospital, packageItem, locale } = input;
  if (!(packageItem.isActive ?? true)) {
    return null;
  }

  const localized = getLocalizedFields(packageItem.translations, locale) as Record<string, unknown> | undefined;
  const gallery = sortByOrder(packageItem.gallery)
    .map((item) => item.imageUrl ?? '')
    .filter(Boolean);
  const tags = sortTags(packageItem.tags)
    .filter((tag) => tag.label)
    .map((tag) => ({
      label: tag.label ?? '',
      category: tag.category ?? '',
    }));
  const includes = sortByOrder(packageItem.includes)
    .map((item, index) => {
      const translatedInclude = getLocalizedItemByIdOrIndex(localized, 'includes', item.id, index);

      return {
        text: pickLocalizedText(item.text, translatedInclude?.text),
      };
    })
    .filter((item) => item.text)
    .map((item) => item.text);
  const process = sortByOrder(packageItem.process)
    .map((item, index) => {
      const translatedProcess = getLocalizedItemByIdOrIndex(localized, 'process', item.id, index);

      return mergeLocalizedRecord({
        stepTitle: item.stepTitle ?? '',
        description: item.description ?? '',
      }, translatedProcess);
    })
    .filter((item) => item.stepTitle || item.description)
    .map((item) => ({
      step: item.stepTitle ?? '',
      desc: item.description ?? '',
    }));
  const cases = sortByOrder(packageItem.cases)
    .map((item, index) => {
      const translatedCase = getLocalizedItemByIdOrIndex(localized, 'cases', item.id, index);

      return mergeLocalizedRecord({
        name: item.patientName ?? '',
        age: item.patientAge ?? null,
        country: item.patientCountry ?? '',
        story: item.story ?? '',
        result: item.result ?? '',
      }, translatedCase);
    })
    .filter((item) => item.name || item.story || item.result)
    .map((item) => ({
      name: item.name ?? '',
      age: item.age ?? null,
      country: item.country ?? '',
      story: item.story ?? '',
      result: item.result ?? '',
    }));
  const reviews = sortByOrder(packageItem.reviews)
    .filter((item) => item.isActive ?? true)
    .map((item, index) => {
      const translatedReview = getLocalizedItemByIdOrIndex(localized, 'reviews', item.id, index);

      return mergeLocalizedRecord({
        name: item.reviewerName ?? '',
        country: item.reviewerCountry ?? '',
        rating: item.rating ?? 0,
        date: item.reviewDate ?? '',
        comment: item.comment ?? '',
      }, translatedReview);
    })
    .filter((item) => item.name || item.comment)
    .map((item) => ({
      name: item.name ?? '',
      country: item.country ?? '',
      rating: item.rating ?? 0,
      date: item.date ?? '',
      comment: item.comment ?? '',
    }));
  const priceUSD = formatNumber(packageItem.price);
  const location = [hospital.city, hospital.province].filter(Boolean).join(', ');

  return {
    id: packageItem.id ?? '',
    slug: packageItem.slug ?? '',
    title: pickLocalizedText(packageItem.title, localized?.title),
    subtitle: pickLocalizedText(packageItem.subtitle, localized?.subtitle),
    coverImage: packageItem.coverImageUrl ?? '',
    gallery,
    priceUSD,
    duration: packageItem.duration ?? '',
    summary: pickLocalizedText(packageItem.summary, localized?.summary),
    includes,
    process,
    tags,
    cases,
    reviews,
    hospital: {
      id: hospital.id ?? '',
      slug: hospital.slug ?? '',
      name: hospital.name ?? '',
      location,
    },
    pdf: {
      fileName: `${packageItem.slug ?? 'package'}.pdf`,
      title: pickLocalizedText(packageItem.title, localized?.title),
      subtitle: pickLocalizedText(packageItem.subtitle, localized?.subtitle),
      hospitalName: hospital.name ?? '',
      priceLine: `${packageItem.currency ?? ''} ${priceUSD}`.trim(),
      duration: packageItem.duration ?? '',
      tags: tags.map((tag) => tag.label).join(' | '),
      summary: pickLocalizedText(packageItem.summary, localized?.summary),
      includes,
      process: process.map((item) => `${item.step}: ${item.desc}`),
      cases: cases.map((item) => `${item.name} (${item.age}, ${item.country}) - ${item.story} Result: ${item.result}`),
      reviews: reviews.map((item) => `${'★'.repeat(item.rating)} ${item.name} (${item.country}, ${item.date}): ${item.comment}`),
    },
  };
}
