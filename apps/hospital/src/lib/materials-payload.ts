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

export function mapHospitalReviewsToPatientReviews(reviews: StoredHospitalReview[] | null | undefined) {
  return sortByOrder(reviews)
    .filter((review) => review.isActive ?? true)
    .map((review) => ({
      id: review.id ?? '',
      name: review.patientName ?? '',
      country: review.patientCountry ?? '',
      avatar: review.patientAvatarUrl ?? '',
      rating: review.rating ?? 0,
      date: review.reviewDate ?? '',
      treatment: review.treatmentName ?? '',
      title: review.reviewTitle ?? '',
      comment: review.reviewComment ?? '',
      featured: review.featured ?? false,
      media: sortByOrder(review.media)
        .filter((item) => item.url)
        .map((item) => ({
          id: item.id ?? '',
          type: item.type ?? 'image',
          url: item.url ?? '',
          thumb: item.thumbnailUrl ?? undefined,
          caption: item.caption ?? undefined,
        })),
    }));
}

export function mapHospitalPackagesToPackageList(packages: StoredPackage[] | null | undefined) {
  return sortByOrder(packages)
    .filter((item) => item.isActive ?? true)
    .map((item) => ({
    id: item.id ?? '',
    slug: item.slug ?? '',
    title: item.title ?? '',
    subtitle: item.subtitle ?? '',
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
    }));
}

export function mapHospitalPackageToPackageDetail(input: {
  hospital: HospitalIdentity;
  packageItem: StoredPackage;
}) {
  const { hospital, packageItem } = input;
  if (!(packageItem.isActive ?? true)) {
    return null;
  }

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
    .map((item) => item.text ?? '')
    .filter(Boolean);
  const process = sortByOrder(packageItem.process)
    .filter((item) => item.stepTitle || item.description)
    .map((item) => ({
      step: item.stepTitle ?? '',
      desc: item.description ?? '',
    }));
  const cases = sortByOrder(packageItem.cases)
    .filter((item) => item.patientName || item.story || item.result)
    .map((item) => ({
      name: item.patientName ?? '',
      age: item.patientAge ?? null,
      country: item.patientCountry ?? '',
      story: item.story ?? '',
      result: item.result ?? '',
    }));
  const reviews = sortByOrder(packageItem.reviews)
    .filter((item) => item.isActive ?? true)
    .map((item) => ({
      name: item.reviewerName ?? '',
      country: item.reviewerCountry ?? '',
      rating: item.rating ?? 0,
      date: item.reviewDate ?? '',
      comment: item.comment ?? '',
    }));
  const priceUSD = formatNumber(packageItem.price);
  const location = [hospital.city, hospital.province].filter(Boolean).join(', ');

  return {
    id: packageItem.id ?? '',
    slug: packageItem.slug ?? '',
    title: packageItem.title ?? '',
    subtitle: packageItem.subtitle ?? '',
    coverImage: packageItem.coverImageUrl ?? '',
    gallery,
    priceUSD,
    duration: packageItem.duration ?? '',
    summary: packageItem.summary ?? '',
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
      title: packageItem.title ?? '',
      subtitle: packageItem.subtitle ?? '',
      hospitalName: hospital.name ?? '',
      priceLine: `${packageItem.currency ?? ''} ${priceUSD}`.trim(),
      duration: packageItem.duration ?? '',
      tags: tags.map((tag) => tag.label).join(' | '),
      summary: packageItem.summary ?? '',
      includes,
      process: process.map((item) => `${item.step}: ${item.desc}`),
      cases: cases.map((item) => `${item.name} (${item.age}, ${item.country}) - ${item.story} Result: ${item.result}`),
      reviews: reviews.map((item) => `${'★'.repeat(item.rating)} ${item.name} (${item.country}, ${item.date}): ${item.comment}`),
    },
  };
}
