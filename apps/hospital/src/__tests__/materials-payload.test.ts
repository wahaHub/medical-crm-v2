import { describe, expect, it } from 'vitest';
import {
  mapHospitalPackageToPackageDetail,
  mapHospitalPackagesToPackageList,
  mapHospitalReviewsToPatientReviews,
  sanitizeDepartmentStats,
} from '../lib/materials-payload';

describe('sanitizeDepartmentStats', () => {
  it('removes null values from department stats before submitting materials info', () => {
    expect(sanitizeDepartmentStats({
      general_surgery: {
        specialists: null,
        annualPatients: null,
      },
      cardiology: {
        specialists: 12,
        annualPatients: null,
      },
    })).toEqual({
      general_surgery: {},
      cardiology: {
        specialists: 12,
      },
    });
  });
});

describe('materials consumer payload mapping', () => {
  const hospitalInfo = {
    id: 'hospital-1',
    name: 'Chengdu Aidi Eye Hospital',
    slug: 'chengdu-aidi-eye-hospital',
    city: 'Chengdu',
    province: 'Sichuan',
  };

  it('maps hospital reviews into the PatientReviews consumer contract', () => {
    expect(mapHospitalReviewsToPatientReviews([
      {
        id: 'review-1',
        sortOrder: 2,
        isActive: true,
        featured: true,
        patientName: 'Sarah Johnson',
        patientCountry: 'USA',
        patientAvatarUrl: 'https://cdn.example.com/avatar.jpg',
        treatmentName: 'LASIK Surgery',
        reviewTitle: 'Life-changing experience',
        reviewComment: 'Excellent clinical team and smooth follow-up.',
        rating: 5,
        reviewDate: '2026-04-24',
        media: [
          {
            id: 'media-1',
            type: 'image',
            url: 'https://cdn.example.com/review-image.jpg',
            thumbnailUrl: null,
            caption: 'Recovery day 2',
            sortOrder: 2,
          },
          {
            id: 'media-2',
            type: 'video',
            url: 'https://cdn.example.com/review-video.mp4',
            thumbnailUrl: 'https://cdn.example.com/review-video-thumb.jpg',
            caption: 'Patient story',
            sortOrder: 1,
          },
        ],
      },
      {
        id: 'review-inactive',
        sortOrder: 1,
        isActive: false,
        featured: false,
        patientName: 'Hidden Review',
        reviewComment: 'Should not render',
        rating: 4,
        media: [],
      },
    ])).toEqual([
      {
        id: 'review-1',
        name: 'Sarah Johnson',
        country: 'USA',
        avatar: 'https://cdn.example.com/avatar.jpg',
        rating: 5,
        date: '2026-04-24',
        treatment: 'LASIK Surgery',
        title: 'Life-changing experience',
        comment: 'Excellent clinical team and smooth follow-up.',
        featured: true,
        media: [
          {
            id: 'media-2',
            type: 'video',
            url: 'https://cdn.example.com/review-video.mp4',
            thumb: 'https://cdn.example.com/review-video-thumb.jpg',
            caption: 'Patient story',
          },
          {
            id: 'media-1',
            type: 'image',
            url: 'https://cdn.example.com/review-image.jpg',
            thumb: undefined,
            caption: 'Recovery day 2',
          },
        ],
      },
    ]);
  });

  it('applies locale translations to hospital reviews while preserving base fallbacks', () => {
    expect(mapHospitalReviewsToPatientReviews([
      {
        id: 'review-1',
        sortOrder: 1,
        isActive: true,
        featured: true,
        patientName: 'Sarah Johnson',
        patientCountry: 'USA',
        patientAvatarUrl: 'https://cdn.example.com/avatar.jpg',
        treatmentName: 'LASIK Surgery',
        reviewTitle: 'Life-changing experience',
        reviewComment: 'Excellent clinical team and smooth follow-up.',
        rating: 5,
        reviewDate: '2026-04-24',
        translations: {
          fr: {
            treatmentName: 'Chirurgie LASIK',
            reviewTitle: 'Experience changeante',
            reviewComment: 'Equipe excellente et suivi fluide.',
          },
        },
      },
    ], 'fr')).toEqual([
      {
        id: 'review-1',
        name: 'Sarah Johnson',
        country: 'USA',
        avatar: 'https://cdn.example.com/avatar.jpg',
        rating: 5,
        date: '2026-04-24',
        treatment: 'Chirurgie LASIK',
        title: 'Experience changeante',
        comment: 'Equipe excellente et suivi fluide.',
        featured: true,
        media: [],
      },
    ]);
  });

  it('maps packages into the PackageList consumer contract with summary counts', () => {
    expect(mapHospitalPackagesToPackageList([
      {
        id: 'package-inactive',
        slug: 'inactive-package',
        sortOrder: 1,
        isActive: false,
        title: 'Inactive package',
        subtitle: 'Should be filtered out',
        coverImageUrl: 'https://cdn.example.com/inactive-cover.jpg',
        gallery: [],
        price: '2500',
        currency: 'USD',
        duration: '3 days',
        summary: 'Should not appear.',
        tags: [],
        includes: [],
        process: [],
        cases: [],
        reviews: [],
      },
      {
        id: 'package-1',
        slug: 'premium-lasik',
        sortOrder: 5,
        isActive: true,
        title: 'Premium LASIK Vision Correction Package',
        subtitle: 'SMILE + bilingual care + follow-up',
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        gallery: [],
        price: '3800',
        currency: 'USD',
        duration: '5-7 days in China',
        summary: 'A complete overseas LASIK journey.',
        tags: [
          { id: 'tag-1', label: 'Vision Correction', category: 'treatment' },
          { id: 'tag-2', label: 'Overseas Patients', category: 'audience' },
        ],
        includes: [],
        process: [],
        cases: [
          { id: 'case-1', patientName: 'Mr. Ahmad', patientAge: 32, patientCountry: 'Malaysia', story: '...', result: '...', sortOrder: 2 },
          { id: 'case-2', patientName: 'Ms. Tanaka', patientAge: 28, patientCountry: 'Japan', story: '...', result: '...', sortOrder: 1 },
        ],
        reviews: [
          { id: 'pkg-review-1', reviewerName: 'Sarah K.', reviewerCountry: 'Singapore', rating: 5, reviewDate: '2026-04-23', comment: 'Excellent', sortOrder: 2, isActive: true },
          { id: 'pkg-review-2', reviewerName: 'David L.', reviewerCountry: 'Australia', rating: 4, reviewDate: '2026-04-20', comment: 'Great value', sortOrder: 1, isActive: false },
        ],
      },
    ])).toEqual([
      {
        id: 'package-1',
        slug: 'premium-lasik',
        title: 'Premium LASIK Vision Correction Package',
        subtitle: 'SMILE + bilingual care + follow-up',
        coverImage: 'https://cdn.example.com/cover.jpg',
        priceUSD: '3,800',
        duration: '5-7 days in China',
        tags: [
          { label: 'Vision Correction', category: 'treatment' },
          { label: 'Overseas Patients', category: 'audience' },
        ],
        caseCount: 2,
        reviewCount: 1,
        isActive: true,
      },
    ]);
  });

  it('applies locale translations to package list cards while preserving base counts', () => {
    expect(mapHospitalPackagesToPackageList([
      {
        id: 'package-1',
        slug: 'premium-lasik',
        sortOrder: 1,
        isActive: true,
        title: 'Premium LASIK Vision Correction Package',
        subtitle: 'SMILE + bilingual care + follow-up',
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        gallery: [],
        price: '3800',
        currency: 'USD',
        duration: '5-7 days in China',
        summary: 'A complete overseas LASIK journey.',
        tags: [],
        includes: [],
        process: [],
        cases: [],
        reviews: [],
        translations: {
          fr: {
            title: 'Forfait LASIK premium',
            subtitle: 'SMILE + soins bilingues',
          },
        },
      },
    ], 'fr-CA')).toEqual([
      {
        id: 'package-1',
        slug: 'premium-lasik',
        title: 'Forfait LASIK premium',
        subtitle: 'SMILE + soins bilingues',
        coverImage: 'https://cdn.example.com/cover.jpg',
        priceUSD: '3,800',
        duration: '5-7 days in China',
        tags: [],
        caseCount: 0,
        reviewCount: 0,
        isActive: true,
      },
    ]);
  });

  it('does not map inactive packages into package detail payloads', () => {
    expect(mapHospitalPackageToPackageDetail({
      hospital: hospitalInfo,
      packageItem: {
        id: 'package-inactive',
        slug: 'inactive-package',
        sortOrder: 1,
        isActive: false,
        title: 'Inactive package',
        subtitle: 'Should be filtered out',
        coverImageUrl: 'https://cdn.example.com/inactive-cover.jpg',
        gallery: [],
        price: '2500',
        currency: 'USD',
        duration: '3 days',
        summary: 'Should not appear.',
        tags: [],
        includes: [],
        process: [],
        cases: [],
        reviews: [],
      },
    })).toBeNull();
  });

  it('maps a full package into the PackageDetail consumer contract including PDF-exported fields', () => {
    expect(mapHospitalPackageToPackageDetail({
      hospital: hospitalInfo,
      packageItem: {
        id: 'package-1',
        slug: 'premium-lasik',
        sortOrder: 5,
        isActive: true,
        title: 'Premium LASIK Vision Correction Package',
        subtitle: 'SMILE + bilingual care + follow-up',
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        gallery: [
          { id: 'gallery-2', imageUrl: 'https://cdn.example.com/gallery-2.jpg', sortOrder: 2 },
          { id: 'gallery-1', imageUrl: 'https://cdn.example.com/gallery-1.jpg', sortOrder: 1 },
        ],
        price: '3800',
        currency: 'USD',
        duration: '5-7 days in China',
        summary: 'A complete overseas LASIK journey.',
        tags: [
          { id: 'tag-2', label: 'Overseas Patients', category: 'audience' },
          { id: 'tag-1', label: 'Vision Correction', category: 'treatment' },
        ],
        includes: [
          { id: 'include-2', text: 'Airport pickup', sortOrder: 2 },
          { id: 'include-1', text: 'SMILE procedure', sortOrder: 1 },
        ],
        process: [
          { id: 'process-2', stepTitle: 'Day 2', description: 'Procedure day', sortOrder: 2 },
          { id: 'process-1', stepTitle: 'Day 1', description: 'Arrival and tests', sortOrder: 1 },
        ],
        cases: [
          { id: 'case-2', patientName: 'Ms. Tanaka', patientAge: 28, patientCountry: 'Japan', story: 'Arrived with high myopia.', result: 'Recovered to 1.5 vision.', sortOrder: 2 },
          { id: 'case-1', patientName: 'Mr. Ahmad', patientAge: 32, patientCountry: 'Malaysia', story: 'Wanted to dive without glasses.', result: 'Back to diving in two weeks.', sortOrder: 1 },
        ],
        reviews: [
          { id: 'review-2', reviewerName: 'David L.', reviewerCountry: 'Australia', rating: 4, reviewDate: '2026-04-20', comment: 'Great value.', sortOrder: 2, isActive: false },
          { id: 'review-1', reviewerName: 'Sarah K.', reviewerCountry: 'Singapore', rating: 5, reviewDate: '2026-04-23', comment: 'Excellent experience.', sortOrder: 1, isActive: true },
        ],
      },
    })).toEqual({
      id: 'package-1',
      slug: 'premium-lasik',
      title: 'Premium LASIK Vision Correction Package',
      subtitle: 'SMILE + bilingual care + follow-up',
      coverImage: 'https://cdn.example.com/cover.jpg',
      gallery: [
        'https://cdn.example.com/gallery-1.jpg',
        'https://cdn.example.com/gallery-2.jpg',
      ],
      priceUSD: '3,800',
      duration: '5-7 days in China',
      summary: 'A complete overseas LASIK journey.',
      includes: [
        'SMILE procedure',
        'Airport pickup',
      ],
      process: [
        { step: 'Day 1', desc: 'Arrival and tests' },
        { step: 'Day 2', desc: 'Procedure day' },
      ],
      tags: [
        { label: 'Vision Correction', category: 'treatment' },
        { label: 'Overseas Patients', category: 'audience' },
      ],
      cases: [
        {
          name: 'Mr. Ahmad',
          age: 32,
          country: 'Malaysia',
          story: 'Wanted to dive without glasses.',
          result: 'Back to diving in two weeks.',
        },
        {
          name: 'Ms. Tanaka',
          age: 28,
          country: 'Japan',
          story: 'Arrived with high myopia.',
          result: 'Recovered to 1.5 vision.',
        },
      ],
      reviews: [
        {
          name: 'Sarah K.',
          country: 'Singapore',
          rating: 5,
          date: '2026-04-23',
          comment: 'Excellent experience.',
        },
      ],
      hospital: {
        id: 'hospital-1',
        slug: 'chengdu-aidi-eye-hospital',
        name: 'Chengdu Aidi Eye Hospital',
        location: 'Chengdu, Sichuan',
      },
      pdf: {
        fileName: 'premium-lasik.pdf',
        title: 'Premium LASIK Vision Correction Package',
        subtitle: 'SMILE + bilingual care + follow-up',
        hospitalName: 'Chengdu Aidi Eye Hospital',
        priceLine: 'USD 3,800',
        duration: '5-7 days in China',
        tags: 'Vision Correction | Overseas Patients',
        summary: 'A complete overseas LASIK journey.',
        includes: [
          'SMILE procedure',
          'Airport pickup',
        ],
        process: [
          'Day 1: Arrival and tests',
          'Day 2: Procedure day',
        ],
        cases: [
          'Mr. Ahmad (32, Malaysia) - Wanted to dive without glasses. Result: Back to diving in two weeks.',
          'Ms. Tanaka (28, Japan) - Arrived with high myopia. Result: Recovered to 1.5 vision.',
        ],
        reviews: [
          '★★★★★ Sarah K. (Singapore, 2026-04-23): Excellent experience.',
        ],
      },
    });
  });

  it('applies locale translations to package detail payloads including nested arrays and pdf copy', () => {
    expect(mapHospitalPackageToPackageDetail({
      hospital: hospitalInfo,
      locale: 'fr-CA',
      packageItem: {
        id: 'package-1',
        slug: 'premium-lasik',
        sortOrder: 5,
        isActive: true,
        title: 'Premium LASIK Vision Correction Package',
        subtitle: 'SMILE + bilingual care + follow-up',
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        gallery: [
          { id: 'gallery-2', imageUrl: 'https://cdn.example.com/gallery-2.jpg', sortOrder: 2 },
          { id: 'gallery-1', imageUrl: 'https://cdn.example.com/gallery-1.jpg', sortOrder: 1 },
        ],
        price: '3800',
        currency: 'USD',
        duration: '5-7 days in China',
        summary: 'A complete overseas LASIK journey.',
        tags: [
          { id: 'tag-2', label: 'Overseas Patients', category: 'audience' },
          { id: 'tag-1', label: 'Vision Correction', category: 'treatment' },
        ],
        includes: [
          { id: 'include-2', text: 'Airport pickup', sortOrder: 2 },
          { id: 'include-1', text: 'SMILE procedure', sortOrder: 1 },
        ],
        process: [
          { id: 'process-2', stepTitle: 'Day 2', description: 'Procedure day', sortOrder: 2 },
          { id: 'process-1', stepTitle: 'Day 1', description: 'Arrival and tests', sortOrder: 1 },
        ],
        cases: [
          { id: 'case-2', patientName: 'Ms. Tanaka', patientAge: 28, patientCountry: 'Japan', story: 'Arrived with high myopia.', result: 'Recovered to 1.5 vision.', sortOrder: 2 },
          { id: 'case-1', patientName: 'Mr. Ahmad', patientAge: 32, patientCountry: 'Malaysia', story: 'Wanted to dive without glasses.', result: 'Back to diving in two weeks.', sortOrder: 1 },
        ],
        reviews: [
          { id: 'review-2', reviewerName: 'David L.', reviewerCountry: 'Australia', rating: 4, reviewDate: '2026-04-20', comment: 'Great value.', sortOrder: 2, isActive: false },
          { id: 'review-1', reviewerName: 'Sarah K.', reviewerCountry: 'Singapore', rating: 5, reviewDate: '2026-04-23', comment: 'Excellent experience.', sortOrder: 1, isActive: true },
        ],
        translations: {
          fr: {
            title: 'Forfait LASIK premium',
            subtitle: 'SMILE + soins bilingues',
            summary: 'Parcours LASIK complet a l etranger.',
            includes: [
              { text: 'Prise en charge a l aeroport' },
            ],
            process: [
              { stepTitle: 'Jour 1', description: 'Arrivee et examens' },
            ],
            cases: [
              { story: 'Voulait nager sans lunettes.', result: 'Retour a la natation en deux semaines.' },
            ],
            reviews: [
              { comment: 'Experience excellente.' },
            ],
          },
        },
      },
    })).toEqual({
      id: 'package-1',
      slug: 'premium-lasik',
      title: 'Forfait LASIK premium',
      subtitle: 'SMILE + soins bilingues',
      coverImage: 'https://cdn.example.com/cover.jpg',
      gallery: [
        'https://cdn.example.com/gallery-1.jpg',
        'https://cdn.example.com/gallery-2.jpg',
      ],
      priceUSD: '3,800',
      duration: '5-7 days in China',
      summary: 'Parcours LASIK complet a l etranger.',
      includes: [
        'Prise en charge a l aeroport',
        'Airport pickup',
      ],
      process: [
        { step: 'Jour 1', desc: 'Arrivee et examens' },
        { step: 'Day 2', desc: 'Procedure day' },
      ],
      tags: [
        { label: 'Vision Correction', category: 'treatment' },
        { label: 'Overseas Patients', category: 'audience' },
      ],
      cases: [
        {
          name: 'Mr. Ahmad',
          age: 32,
          country: 'Malaysia',
          story: 'Voulait nager sans lunettes.',
          result: 'Retour a la natation en deux semaines.',
        },
        {
          name: 'Ms. Tanaka',
          age: 28,
          country: 'Japan',
          story: 'Arrived with high myopia.',
          result: 'Recovered to 1.5 vision.',
        },
      ],
      reviews: [
        {
          name: 'Sarah K.',
          country: 'Singapore',
          rating: 5,
          date: '2026-04-23',
          comment: 'Experience excellente.',
        },
      ],
      hospital: {
        id: 'hospital-1',
        slug: 'chengdu-aidi-eye-hospital',
        name: 'Chengdu Aidi Eye Hospital',
        location: 'Chengdu, Sichuan',
      },
      pdf: {
        fileName: 'premium-lasik.pdf',
        title: 'Forfait LASIK premium',
        subtitle: 'SMILE + soins bilingues',
        hospitalName: 'Chengdu Aidi Eye Hospital',
        priceLine: 'USD 3,800',
        duration: '5-7 days in China',
        tags: 'Vision Correction | Overseas Patients',
        summary: 'Parcours LASIK complet a l etranger.',
        includes: [
          'Prise en charge a l aeroport',
          'Airport pickup',
        ],
        process: [
          'Jour 1: Arrivee et examens',
          'Day 2: Procedure day',
        ],
        cases: [
          'Mr. Ahmad (32, Malaysia) - Voulait nager sans lunettes. Result: Retour a la natation en deux semaines.',
          'Ms. Tanaka (28, Japan) - Arrived with high myopia. Result: Recovered to 1.5 vision.',
        ],
        reviews: [
          '★★★★★ Sarah K. (Singapore, 2026-04-23): Experience excellente.',
        ],
      },
    });
  });
});
