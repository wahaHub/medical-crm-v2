import { beforeEach, describe, expect, it, vi } from 'vitest';
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
