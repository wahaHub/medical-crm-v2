import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { OpenAPIHono } from '@hono/zod-openapi';
import { DomainError, mapErrorToStatus } from '@medical-crm/utils';
import materialsRoutes from '../routes/materials.routes.js';

const mockResolveHospitalType = vi.fn<[string], Promise<'COSMETIC' | 'REGULAR'>>();

const mockServices = {
  getHospitalInfo: { execute: vi.fn() },
  updateHospitalInfo: { execute: vi.fn() },
  getProcedures: { execute: vi.fn() },
  createProcedure: { execute: vi.fn() },
  updateProcedure: { execute: vi.fn() },
  deleteProcedure: { execute: vi.fn() },
  getSurgeons: { execute: vi.fn() },
  createSurgeon: { execute: vi.fn() },
  updateSurgeon: { execute: vi.fn() },
  deleteSurgeon: { execute: vi.fn() },
  getBeforeAfterCases: { execute: vi.fn() },
  createBeforeAfterCase: { execute: vi.fn() },
  updateBeforeAfterCase: { execute: vi.fn() },
  deleteBeforeAfterCase: { execute: vi.fn() },
  getMaterialsReviews: { execute: vi.fn() },
  createMaterialsReview: { execute: vi.fn() },
  updateMaterialsReview: { execute: vi.fn() },
  deleteMaterialsReview: { execute: vi.fn() },
  getMaterialsPackages: { execute: vi.fn() },
  getMaterialsPackage: { execute: vi.fn() },
  createMaterialsPackage: { execute: vi.fn() },
  updateMaterialsPackage: { execute: vi.fn() },
  deleteMaterialsPackage: { execute: vi.fn() },
  mediaUpload: { createUploadIntent: vi.fn() },
  resolveHospitalType: mockResolveHospitalType,
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

type SessionData = {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
};

let currentSession: SessionData = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  roles: ['HOSPITAL'],
  hospitalId: '00000000-0000-0000-0000-000000000001',
};

const app = new OpenAPIHono();
app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});
app.route('/', materialsRoutes);
app.onError((err, c) => {
  if (err instanceof DomainError) {
    const status = mapErrorToStatus(err.code);
    return c.json({ error: err.message, code: err.code }, status as 400 | 401 | 403 | 404 | 409 | 422 | 500);
  }
  return c.json({ error: 'Internal server error' }, 500);
});

const VALID_HOSPITAL_ID = '00000000-0000-0000-0000-000000000001';
const VALID_SURGEON_ID = '00000000-0000-0000-0000-000000000002';
const VALID_REVIEW_ID = '00000000-0000-0000-0000-000000000003';
const VALID_PACKAGE_ID = '00000000-0000-0000-0000-000000000004';
const routeSource = readFileSync(new URL('../routes/materials.routes.ts', import.meta.url), 'utf8');
const compositionRootSource = readFileSync(new URL('../composition-root.ts', import.meta.url), 'utf8');

const uploadIntentResult = {
  uploadUrl: 'https://storage.example.com/upload/photo.jpg',
  storageKey: 'crm/dev/hospital_material/hospital-1/asset-1/photo.jpg',
  expiresIn: 600,
  asset: {
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 204800,
    storageKey: 'crm/dev/hospital_material/hospital-1/asset-1/photo.jpg',
  },
};

describe('Materials routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveHospitalType.mockResolvedValue('REGULAR');
  });

  it('registers hospital materials review CRUD routes', () => {
    expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/reviews');
    expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/reviews/{id}');
  });

  it('registers hospital materials package CRUD routes', () => {
    expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/packages');
    expect(routeSource).toContain('/api/v2/hospitals/{hospitalId}/materials/packages/{id}');
  });

  it('wires hospital materials review and package use cases in composition root', () => {
    expect(compositionRootSource).toContain('getMaterialsReviews: new GetMaterialsReviewsUseCase(materialsRepo, resolveHospitalType)');
    expect(compositionRootSource).toContain('createMaterialsReview: new CreateMaterialsReviewUseCase(materialsRepo, resolveHospitalType, translationTaskService)');
    expect(compositionRootSource).toContain('updateMaterialsReview: new UpdateMaterialsReviewUseCase(materialsRepo, resolveHospitalType, translationTaskService)');
    expect(compositionRootSource).toContain('deleteMaterialsReview: new DeleteMaterialsReviewUseCase(materialsRepo, resolveHospitalType)');
    expect(compositionRootSource).toContain('getMaterialsPackages: new GetMaterialsPackagesUseCase(materialsRepo, resolveHospitalType)');
    expect(compositionRootSource).toContain('getMaterialsPackage: new GetMaterialsPackageUseCase(materialsRepo, resolveHospitalType)');
    expect(compositionRootSource).toContain('createMaterialsPackage: new CreateMaterialsPackageUseCase(materialsRepo, resolveHospitalType, translationTaskService)');
    expect(compositionRootSource).toContain('updateMaterialsPackage: new UpdateMaterialsPackageUseCase(materialsRepo, resolveHospitalType, translationTaskService)');
    expect(compositionRootSource).toContain('deleteMaterialsPackage: new DeleteMaterialsPackageUseCase(materialsRepo, resolveHospitalType)');
  });

  it('accepts extended surgeon fields on create', async () => {
    mockServices.createSurgeon.execute.mockResolvedValue({ id: VALID_SURGEON_ID });

    const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/surgeons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dr. Kim',
        title: 'Chief Surgeon',
        education: ['Yonsei University'],
        certifications: ['Board Certified'],
        intro: 'Intro',
        expertise: 'Expertise',
        philosophy: 'Philosophy',
        achievements: ['Achievement'],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockServices.createSurgeon.execute).toHaveBeenCalledWith(
      VALID_HOSPITAL_ID,
      expect.objectContaining({
        education: ['Yonsei University'],
        certifications: ['Board Certified'],
        intro: 'Intro',
        expertise: 'Expertise',
        philosophy: 'Philosophy',
        achievements: ['Achievement'],
      }),
      expect.anything(),
    );
  });

  it('accepts extended surgeon fields on update', async () => {
    mockServices.updateSurgeon.execute.mockResolvedValue({ id: VALID_SURGEON_ID });

    const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/surgeons/${VALID_SURGEON_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        education: ['Harvard Medical School'],
        achievements: ['Award winner'],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.updateSurgeon.execute).toHaveBeenCalledWith(
      VALID_HOSPITAL_ID,
      VALID_SURGEON_ID,
      expect.objectContaining({
        education: ['Harvard Medical School'],
        achievements: ['Award winner'],
      }),
      expect.anything(),
    );
  });

  describe('hospital materials reviews routes', () => {
    const validReviewPayload = {
      sortOrder: 2,
      isActive: true,
      featured: true,
      patientName: 'Sarah Chen',
      patientCountry: 'Singapore',
      patientAvatarUrl: 'https://example.com/avatar.jpg',
      treatmentName: 'LASIK',
      reviewTitle: 'Smooth recovery',
      reviewComment: 'Great care from the team.',
      rating: 5,
      reviewDate: '2026-04-24',
      media: [
        {
          type: 'image',
          url: 'https://example.com/review-1.jpg',
          thumbnailUrl: 'https://example.com/review-1-thumb.jpg',
          caption: 'Day 1',
          sortOrder: 0,
        },
      ],
    };

    it('returns materials reviews for a hospital actor', async () => {
      mockServices.getMaterialsReviews.execute.mockResolvedValue([
        { id: VALID_REVIEW_ID, ...validReviewPayload },
      ]);

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([
        expect.objectContaining({ id: VALID_REVIEW_ID, patientName: 'Sarah Chen', rating: 5 }),
      ]);
      expect(mockServices.getMaterialsReviews.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        expect.anything(),
      );
    });

    it('creates a materials review', async () => {
      mockServices.createMaterialsReview.execute.mockResolvedValue({
        id: VALID_REVIEW_ID,
        hospitalId: VALID_HOSPITAL_ID,
        ...validReviewPayload,
      });

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validReviewPayload),
      });

      expect(res.status).toBe(201);
      expect(mockServices.createMaterialsReview.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        expect.objectContaining({
          patientName: 'Sarah Chen',
          rating: 5,
          media: [expect.objectContaining({ type: 'image' })],
        }),
        expect.anything(),
      );
    });

    it('updates a materials review', async () => {
      mockServices.updateMaterialsReview.execute.mockResolvedValue({
        id: VALID_REVIEW_ID,
        hospitalId: VALID_HOSPITAL_ID,
        ...validReviewPayload,
        reviewComment: 'Updated comment',
      });

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews/${VALID_REVIEW_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewComment: 'Updated comment' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.updateMaterialsReview.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        VALID_REVIEW_ID,
        expect.objectContaining({ reviewComment: 'Updated comment' }),
        expect.anything(),
      );
    });

    it('deletes a materials review', async () => {
      mockServices.deleteMaterialsReview.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews/${VALID_REVIEW_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(mockServices.deleteMaterialsReview.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        VALID_REVIEW_ID,
        expect.anything(),
      );
    });

    it('rejects cosmetic hospitals across materials review routes', async () => {
      mockResolveHospitalType.mockResolvedValue('COSMETIC');

      const requests = [
        { path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, init: undefined },
        {
          path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validReviewPayload),
          },
        },
        {
          path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews/${VALID_REVIEW_ID}`,
          init: {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewComment: 'Updated comment' }),
          },
        },
        {
          path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews/${VALID_REVIEW_ID}`,
          init: { method: 'DELETE' },
        },
      ];

      for (const request of requests) {
        const res = await app.request(request.path, request.init);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: 'Materials reviews are only available for regular hospitals',
          code: 'FORBIDDEN',
        });
      }

      expect(mockServices.getMaterialsReviews.execute).not.toHaveBeenCalled();
      expect(mockServices.createMaterialsReview.execute).not.toHaveBeenCalled();
      expect(mockServices.updateMaterialsReview.execute).not.toHaveBeenCalled();
      expect(mockServices.deleteMaterialsReview.execute).not.toHaveBeenCalled();
    });

    it('rejects a review payload with missing patientName', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validReviewPayload, patientName: '' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsReview.execute).not.toHaveBeenCalled();
    });

    it('rejects a review payload with an out-of-range rating', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validReviewPayload, rating: 6 }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsReview.execute).not.toHaveBeenCalled();
    });

    it('rejects a review payload with a blank reviewComment', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validReviewPayload, reviewComment: '' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsReview.execute).not.toHaveBeenCalled();
    });

    it('rejects a review payload with an invalid reviewDate', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validReviewPayload, reviewDate: 'not-a-date' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsReview.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid review media payloads', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validReviewPayload,
          media: [{ type: 'gif', url: 'https://example.com/review.gif' }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsReview.execute).not.toHaveBeenCalled();
    });

    it('rejects review media payloads with a non-integer sortOrder', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validReviewPayload,
          media: [{ type: 'image', url: 'https://example.com/review.jpg', sortOrder: 1.5 }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsReview.execute).not.toHaveBeenCalled();
    });
  });

  describe('hospital materials packages routes', () => {
    const validPackagePayload = {
      slug: 'premium-lasik',
      sortOrder: 1,
      isActive: true,
      title: 'Premium LASIK',
      subtitle: 'Fast recovery package',
      coverImageUrl: 'https://example.com/cover.jpg',
      gallery: [{ imageUrl: 'https://example.com/gallery-1.jpg', sortOrder: 0 }],
      price: '1200.00',
      currency: 'USD',
      duration: '3 days',
      summary: 'Complete LASIK treatment package.',
      tags: [{ label: 'Popular', category: 'service' }],
      includes: [{ text: 'Consultation', sortOrder: 0 }],
      process: [{ stepTitle: 'Assessment', description: 'Eye exam and prep', sortOrder: 0 }],
      cases: [{
        patientName: 'Liam',
        patientAge: 34,
        patientCountry: 'US',
        story: 'Wanted clearer vision.',
        result: 'Recovered well.',
        sortOrder: 0,
      }],
      reviews: [{
        reviewerName: 'Jane',
        reviewerCountry: 'US',
        rating: 5,
        reviewDate: '2026-04-24',
        comment: 'Excellent package.',
        sortOrder: 0,
        isActive: true,
      }],
    };

    it('returns materials packages for a hospital actor', async () => {
      mockServices.getMaterialsPackages.execute.mockResolvedValue([
        { id: VALID_PACKAGE_ID, hospitalId: VALID_HOSPITAL_ID, ...validPackagePayload },
      ]);

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([
        expect.objectContaining({ id: VALID_PACKAGE_ID, title: 'Premium LASIK', slug: 'premium-lasik' }),
      ]);
      expect(mockServices.getMaterialsPackages.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        expect.anything(),
      );
    });

    it('returns a single materials package', async () => {
      mockServices.getMaterialsPackage.execute.mockResolvedValue({
        id: VALID_PACKAGE_ID,
        hospitalId: VALID_HOSPITAL_ID,
        ...validPackagePayload,
      });

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages/${VALID_PACKAGE_ID}`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(expect.objectContaining({ id: VALID_PACKAGE_ID, slug: 'premium-lasik' }));
      expect(mockServices.getMaterialsPackage.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        VALID_PACKAGE_ID,
        expect.anything(),
      );
    });

    it('creates a materials package with nested detail sections', async () => {
      mockServices.createMaterialsPackage.execute.mockResolvedValue({
        id: VALID_PACKAGE_ID,
        hospitalId: VALID_HOSPITAL_ID,
        ...validPackagePayload,
      });

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPackagePayload),
      });

      expect(res.status).toBe(201);
      expect(mockServices.createMaterialsPackage.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        expect.objectContaining({
          title: 'Premium LASIK',
          slug: 'premium-lasik',
          tags: [expect.objectContaining({ category: 'service' })],
          cases: [expect.objectContaining({ patientAge: 34 })],
          reviews: [expect.objectContaining({ rating: 5 })],
        }),
        expect.anything(),
      );
    });

    it('updates a materials package', async () => {
      mockServices.updateMaterialsPackage.execute.mockResolvedValue({
        id: VALID_PACKAGE_ID,
        hospitalId: VALID_HOSPITAL_ID,
        ...validPackagePayload,
        title: 'Updated LASIK',
      });

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages/${VALID_PACKAGE_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated LASIK' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.updateMaterialsPackage.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        VALID_PACKAGE_ID,
        expect.objectContaining({ title: 'Updated LASIK' }),
        expect.anything(),
      );
    });

    it('deletes a materials package', async () => {
      mockServices.deleteMaterialsPackage.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages/${VALID_PACKAGE_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(mockServices.deleteMaterialsPackage.execute).toHaveBeenCalledWith(
        VALID_HOSPITAL_ID,
        VALID_PACKAGE_ID,
        expect.anything(),
      );
    });

    it('rejects invalid package payloads', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPackagePayload,
          title: '',
          slug: '',
          price: 'abc',
          currency: '',
          summary: '',
          coverImageUrl: '',
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid package review rating payloads', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPackagePayload,
          reviews: [{
            reviewerName: 'Jane',
            reviewerCountry: 'US',
            rating: 6,
            reviewDate: '2026-04-24',
            comment: 'Great',
            sortOrder: 0,
            isActive: true,
          }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
    });

    it('rejects incomplete package case payloads', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPackagePayload,
          cases: [{ ...validPackagePayload.cases[0], patientCountry: '' }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
    });

    it('rejects incomplete package review payloads', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPackagePayload,
          reviews: [{ ...validPackagePayload.reviews[0], reviewDate: '' }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
    });

    it('rejects incomplete nested package section payloads', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPackagePayload,
          includes: [{ text: '', sortOrder: 0 }],
          process: [{ stepTitle: 'Assessment', description: '', sortOrder: 0 }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
    });

    it('rejects cosmetic hospitals across materials package routes', async () => {
      mockResolveHospitalType.mockResolvedValue('COSMETIC');

      const requests = [
        { path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, init: undefined },
        { path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages/${VALID_PACKAGE_ID}`, init: undefined },
        {
          path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validPackagePayload),
          },
        },
        {
          path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages/${VALID_PACKAGE_ID}`,
          init: {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Updated LASIK' }),
          },
        },
        {
          path: `/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages/${VALID_PACKAGE_ID}`,
          init: { method: 'DELETE' },
        },
      ];

      for (const request of requests) {
        const res = await app.request(request.path, request.init);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: 'Materials packages are only available for regular hospitals',
          code: 'FORBIDDEN',
        });
      }

      expect(mockServices.getMaterialsPackages.execute).not.toHaveBeenCalled();
      expect(mockServices.getMaterialsPackage.execute).not.toHaveBeenCalled();
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
      expect(mockServices.updateMaterialsPackage.execute).not.toHaveBeenCalled();
      expect(mockServices.deleteMaterialsPackage.execute).not.toHaveBeenCalled();
    });

    it('rejects package cases with a non-numeric patientAge', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPackagePayload,
          cases: [{ ...validPackagePayload.cases[0], patientAge: '34' }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
    });

    it('rejects package tags with an unsupported category', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPackagePayload,
          tags: [{ ...validPackagePayload.tags[0], category: 'badge' }],
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMaterialsPackage.execute).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v2/hospitals/:hospitalId/materials/upload
  // -------------------------------------------------------------------------
  describe('POST /api/v2/hospitals/:hospitalId/materials/upload', () => {
    const validBody = {
      materialKind: 'surgeon',
      fileName: 'photo.jpg',
      fileSize: 204800,
      mimeType: 'image/jpeg',
    };

    it('returns 201 with upload URL and asset for COSMETIC hospital + surgeon materialKind', async () => {
      mockResolveHospitalType.mockResolvedValue('COSMETIC');
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue(uploadIntentResult);

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(201);
      const json = await res.json() as Record<string, unknown>;
      expect((json.upload as Record<string, unknown>).uploadUrl).toBe(uploadIntentResult.uploadUrl);
      expect((json.upload as Record<string, unknown>).storageKey).toBe(uploadIntentResult.storageKey);
      expect((json.upload as Record<string, unknown>).expiresIn).toBe(600);
      expect(json.asset).toEqual(uploadIntentResult.asset);
      expect(mockResolveHospitalType).toHaveBeenCalledWith(VALID_HOSPITAL_ID);
      expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'materials_beauty_surgeon_image',
          ownerType: 'hospital_material',
          ownerId: VALID_HOSPITAL_ID,
          fileName: 'photo.jpg',
          fileSize: 204800,
          mimeType: 'image/jpeg',
        }),
      );
    });

    it('returns 201 with upload URL and asset for REGULAR hospital + testimonial_video materialKind', async () => {
      mockResolveHospitalType.mockResolvedValue('REGULAR');
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue(uploadIntentResult);

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, materialKind: 'testimonial_video', fileName: 'intro.mp4', mimeType: 'video/mp4' }),
      });

      expect(res.status).toBe(201);
      expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'materials_regular_testimonial_video',
          ownerType: 'hospital_material',
          ownerId: VALID_HOSPITAL_ID,
          fileName: 'intro.mp4',
          fileSize: 204800,
          mimeType: 'video/mp4',
        }),
      );
    });

    it('returns 422 for unknown materialKind', async () => {
      mockResolveHospitalType.mockResolvedValue('COSMETIC');

      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, materialKind: 'unknown_kind' }),
      });

      expect(res.status).toBe(422);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid hospitalId UUID param', async () => {
      const res = await app.request('/api/v2/hospitals/not-a-uuid/materials/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });

    it('returns 400 for missing required body fields', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'photo.jpg', fileSize: 204800 }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });

    it('returns 403 when HOSPITAL role accesses a different hospitalId', async () => {
      const OTHER_HOSPITAL_ID = '00000000-0000-0000-0000-000000000099';

      const res = await app.request(`/api/v2/hospitals/${OTHER_HOSPITAL_ID}/materials/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      // HOSPITAL session hospitalId is VALID_HOSPITAL_ID, not OTHER_HOSPITAL_ID
      expect(res.status).toBe(403);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });
  });
});
