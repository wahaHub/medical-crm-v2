import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import { resolveMaterialsPolicyId } from '@medical-crm/application/upload-policies';
import type { Session } from '@medical-crm/infrastructure/auth';
import { ForbiddenError } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const hospitalIdParamSchema = z.object({
  hospitalId: z.string().uuid(),
});

const hospitalIdAndIdParamSchema = z.object({
  hospitalId: z.string().uuid(),
  id: z.string().uuid(),
});

type MaterialsRouteServices = ReturnType<typeof getServices> & {
  getMaterialsReviews: { execute: (hospitalId: string, actor: unknown) => Promise<unknown> };
  createMaterialsReview: { execute: (hospitalId: string, input: unknown, actor: unknown) => Promise<unknown> };
  updateMaterialsReview: { execute: (hospitalId: string, reviewId: string, input: unknown, actor: unknown) => Promise<unknown> };
  deleteMaterialsReview: { execute: (hospitalId: string, reviewId: string, actor: unknown) => Promise<void> };
  getMaterialsPackages: { execute: (hospitalId: string, actor: unknown) => Promise<unknown> };
  getMaterialsPackage: { execute: (hospitalId: string, packageId: string, actor: unknown) => Promise<unknown> };
  createMaterialsPackage: { execute: (hospitalId: string, input: unknown, actor: unknown) => Promise<unknown> };
  updateMaterialsPackage: { execute: (hospitalId: string, packageId: string, input: unknown, actor: unknown) => Promise<unknown> };
  deleteMaterialsPackage: { execute: (hospitalId: string, packageId: string, actor: unknown) => Promise<void> };
};

const getMaterialsRouteServices = (): MaterialsRouteServices => getServices() as MaterialsRouteServices;

async function assertRegularMaterialsFeature(
  services: MaterialsRouteServices,
  hospitalId: string,
  feature: 'reviews' | 'packages',
): Promise<void> {
  const hospitalType = await services.resolveHospitalType(hospitalId);
  if (hospitalType !== 'REGULAR') {
    throw new ForbiddenError(`Materials ${feature} are only available for regular hospitals`);
  }
}

const isValidDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const requiredString = (max: number) => z.string().trim().min(1).max(max);
const optionalString = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDateOnly = z.string().refine(isValidDateOnly, 'Invalid date').nullable().optional();
const caseMediaItemSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
});

const reviewMediaSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['image', 'video']),
  url: requiredString(2048),
  thumbnailUrl: optionalString(2048),
  caption: optionalString(300),
  sortOrder: z.number().int().optional(),
});

const createReviewSchema = z.object({
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  featured: z.boolean().optional(),
  patientName: requiredString(120),
  patientCountry: optionalString(120),
  patientAvatarUrl: optionalString(2048),
  treatmentName: optionalString(160),
  reviewTitle: optionalString(180),
  reviewComment: requiredString(4000),
  rating: z.number().int().min(1).max(5),
  reviewDate: optionalDateOnly,
  media: z.array(reviewMediaSchema).optional(),
});

const updateReviewSchema = z.object({
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  featured: z.boolean().optional(),
  patientName: requiredString(120).optional(),
  patientCountry: optionalString(120),
  patientAvatarUrl: optionalString(2048),
  treatmentName: optionalString(160),
  reviewTitle: optionalString(180),
  reviewComment: requiredString(4000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  reviewDate: optionalDateOnly,
  media: z.array(reviewMediaSchema).optional(),
});

const packagePriceSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format');
const packageTagCategoryValues = ['treatment', 'service', 'audience', 'city', 'price', 'style'] as const;
const packageTagCategorySchema = z.enum(packageTagCategoryValues);

const packageGalleryItemSchema = z.object({
  id: z.string().uuid().optional(),
  imageUrl: requiredString(2048),
  sortOrder: z.number().int().optional(),
});

const packageTagSchema = z.object({
  id: z.string().uuid().optional(),
  label: requiredString(80),
  category: packageTagCategorySchema.nullable().optional(),
});

const packageIncludeSchema = z.object({
  id: z.string().uuid().optional(),
  text: requiredString(200),
  sortOrder: z.number().int().optional(),
});

const packageProcessSchema = z.object({
  id: z.string().uuid().optional(),
  stepTitle: requiredString(160),
  description: requiredString(2000),
  sortOrder: z.number().int().optional(),
});

const packageCaseSchema = z.object({
  id: z.string().uuid().optional(),
  patientName: requiredString(120),
  patientAge: z.number().int(),
  patientCountry: requiredString(120),
  story: requiredString(3000),
  result: requiredString(3000),
  sortOrder: z.number().int().optional(),
});

const packageReviewSchema = z.object({
  id: z.string().uuid().optional(),
  reviewerName: requiredString(120),
  reviewerCountry: requiredString(120),
  rating: z.number().int().min(1).max(5),
  reviewDate: z.string().refine(isValidDateOnly, 'Invalid date'),
  comment: requiredString(4000),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const createPackageSchema = z.object({
  slug: requiredString(160),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  title: requiredString(180),
  subtitle: optionalString(220),
  coverImageUrl: requiredString(2048),
  gallery: z.array(packageGalleryItemSchema).optional(),
  price: packagePriceSchema,
  currency: requiredString(10),
  duration: optionalString(80),
  summary: requiredString(4000),
  tags: z.array(packageTagSchema).optional(),
  includes: z.array(packageIncludeSchema).optional(),
  process: z.array(packageProcessSchema).optional(),
  cases: z.array(packageCaseSchema).optional(),
  reviews: z.array(packageReviewSchema).optional(),
});

const updatePackageSchema = z.object({
  slug: requiredString(160).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  title: requiredString(180).optional(),
  subtitle: optionalString(220),
  coverImageUrl: requiredString(2048).optional(),
  gallery: z.array(packageGalleryItemSchema).optional(),
  price: packagePriceSchema.optional(),
  currency: requiredString(10).optional(),
  duration: optionalString(80),
  summary: requiredString(4000).optional(),
  tags: z.array(packageTagSchema).optional(),
  includes: z.array(packageIncludeSchema).optional(),
  process: z.array(packageProcessSchema).optional(),
  cases: z.array(packageCaseSchema).optional(),
  reviews: z.array(packageReviewSchema).optional(),
});

// ---------------------------------------------------------------------------
// 1. GET /api/v2/hospitals/:hospitalId/materials/info — GetHospitalInfo
// ---------------------------------------------------------------------------
const getHospitalInfoRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/info',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'Hospital materials info' } },
});

app.openapi(getHospitalInfoRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getHospitalInfo.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2. POST /api/v2/hospitals/:hospitalId/materials/info — UpdateHospitalInfo
// ---------------------------------------------------------------------------
const updateHospitalInfoRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/info',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            heroImage: z.string().nullable().optional(),
            photos: z.array(z.string()).optional(),
            highlights: z.array(z.object({ icon: z.string(), text: z.string() })).optional(),
            name: z.string().optional(),
            nameEn: z.string().optional(),
            yearEstablished: z.number().nullable().optional(),
            totalPatients: z.number().nullable().optional(),
            tagline: z.string().optional(),
            taglineEn: z.string().optional(),
            description: z.string().optional(),
            descriptionEn: z.string().optional(),
            isActive: z.boolean().optional(),
            paymentMethods: z.array(z.string()).optional(),
            address: z.string().optional(),
            phone: z.string().optional(),
            email: z.string().optional(),
            website: z.string().optional(),
            operatingHours: z.string().optional(),
            latitude: z.number().nullable().optional(),
            longitude: z.number().nullable().optional(),
            mapEmbed: z.string().optional(),
            certifications: z.array(z.object({
              id: z.string(),
              name: z.string(),
              nameEn: z.string().optional(),
              year: z.number().optional(),
              isActive: z.boolean(),
            })).optional(),
            bedCount: z.number().nullable().optional(),
            patientCapacity: z.number().nullable().optional(),
            recommendRate: z.number().nullable().optional(),
            multilingualStaff: z.array(z.string()).optional(),
            airportServices: z.array(z.string()).optional(),
            followUpCare: z.array(z.string()).optional(),
            amenities: z.array(z.string()).optional(),
            nearbyAttractions: z.array(z.object({
              id: z.string().optional(),
              name: z.string(),
              nameEn: z.string().optional(),
              distance: z.string(),
            })).optional(),
            videoTestimonials: z.array(z.object({
              id: z.string(),
              patientName: z.string(),
              patientCountry: z.string().optional(),
              procedureName: z.string().optional(),
              videoUrl: z.string(),
              thumbnailUrl: z.string().optional(),
              duration: z.string().optional(),
              uploadedAt: z.string().optional(),
            })).optional(),
            // Regular hospital specific
            city: z.string().optional(),
            district: z.string().optional(),
            province: z.string().optional(),
            hospitalType: z.string().optional(),
            tier: z.string().optional(),
            ownershipType: z.string().optional(),
            clinicalCapabilities: z.array(z.string()).optional(),
            equipment: z.array(z.object({
              name: z.string(),
              image_url: z.string().optional(),
              description: z.string().optional(),
            })).optional(),
            overview: z.string().optional(),
            overviewEn: z.string().optional(),
            fullDescription: z.string().optional(),
            fullDescriptionEn: z.string().optional(),
            departments: z.array(z.string()).optional(),
            departmentDescriptions: z.record(z.string()).optional(),
            departmentKeyServices: z.record(z.array(z.string())).optional(),
            departmentStats: z.record(z.object({
              specialists: z.number().optional(),
              annualPatients: z.number().optional(),
            })).optional(),
          }).passthrough(), // allow additional fields
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Hospital info updated' } },
});

app.openapi(updateHospitalInfoRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateHospitalInfo.execute(
    hospitalId,
    body as import('@medical-crm/application').UpdateHospitalInfoInput,
    actor,
  );
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/hospitals/:hospitalId/materials/procedures — GetProcedures
// ---------------------------------------------------------------------------
const getProceduresRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of procedures' } },
});

app.openapi(getProceduresRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getProcedures.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. POST /api/v2/hospitals/:hospitalId/materials/procedures — CreateProcedure
// ---------------------------------------------------------------------------
const createProcedureRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1),
            description: z.string().nullable().optional(),
            priceMin: z.number().nullable().optional(),
            priceMax: z.number().nullable().optional(),
            priceRange: z.string().nullable().optional(),
            isPopular: z.boolean().optional(),
            sortOrder: z.number().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Procedure created' } },
});

app.openapi(createProcedureRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createProcedure.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 5. PUT /api/v2/hospitals/:hospitalId/materials/procedures/:id — UpdateProcedure
// ---------------------------------------------------------------------------
const updateProcedureRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1).optional(),
            description: z.string().nullable().optional(),
            priceMin: z.number().nullable().optional(),
            priceMax: z.number().nullable().optional(),
            priceRange: z.string().nullable().optional(),
            isPopular: z.boolean().optional(),
            sortOrder: z.number().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Procedure updated' } },
});

app.openapi(updateProcedureRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateProcedure.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. DELETE /api/v2/hospitals/:hospitalId/materials/procedures/:id — DeleteProcedure
// ---------------------------------------------------------------------------
const deleteProcedureRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/procedures/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Procedure deleted' } },
});

app.openapi(deleteProcedureRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteProcedure.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 7. GET /api/v2/hospitals/:hospitalId/materials/surgeons — GetSurgeons
// ---------------------------------------------------------------------------
const getSurgeonsRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of surgeons' } },
});

app.openapi(getSurgeonsRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getSurgeons.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v2/hospitals/:hospitalId/materials/surgeons — CreateSurgeon
// ---------------------------------------------------------------------------
const createSurgeonRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
            title: z.string().nullable().optional(),
            imageUrl: z.string().nullable().optional(),
            experienceYears: z.number().nullable().optional(),
            specialties: z.array(z.string()).optional(),
            languages: z.array(z.string()).optional(),
            education: z.array(z.string()).optional(),
            certifications: z.array(z.string()).optional(),
            intro: z.string().nullable().optional(),
            expertise: z.string().nullable().optional(),
            philosophy: z.string().nullable().optional(),
            achievements: z.array(z.string()).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Surgeon created' } },
});

app.openapi(createSurgeonRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createSurgeon.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 9. PUT /api/v2/hospitals/:hospitalId/materials/surgeons/:id — UpdateSurgeon
// ---------------------------------------------------------------------------
const updateSurgeonRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1).optional(),
            title: z.string().nullable().optional(),
            imageUrl: z.string().nullable().optional(),
            experienceYears: z.number().nullable().optional(),
            specialties: z.array(z.string()).optional(),
            languages: z.array(z.string()).optional(),
            education: z.array(z.string()).optional(),
            certifications: z.array(z.string()).optional(),
            intro: z.string().nullable().optional(),
            expertise: z.string().nullable().optional(),
            philosophy: z.string().nullable().optional(),
            achievements: z.array(z.string()).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Surgeon updated' } },
});

app.openapi(updateSurgeonRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateSurgeon.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 10. DELETE /api/v2/hospitals/:hospitalId/materials/surgeons/:id — DeleteSurgeon
// ---------------------------------------------------------------------------
const deleteSurgeonRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/surgeons/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Surgeon deleted' } },
});

app.openapi(deleteSurgeonRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteSurgeon.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 11. GET /api/v2/hospitals/:hospitalId/materials/cases — GetBeforeAfterCases
// ---------------------------------------------------------------------------
const getBeforeAfterCasesRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of before/after cases' } },
});

app.openapi(getBeforeAfterCasesRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getBeforeAfterCases.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 12. POST /api/v2/hospitals/:hospitalId/materials/cases — CreateBeforeAfterCase
// ---------------------------------------------------------------------------
const createBeforeAfterCaseRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1),
            surgeonName: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            images: z.array(z.object({
              url: z.string(),
            })).optional(),
            media: z.array(caseMediaItemSchema).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Before/after case created' } },
});

app.openapi(createBeforeAfterCaseRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createBeforeAfterCase.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 13. PUT /api/v2/hospitals/:hospitalId/materials/cases/:id — UpdateBeforeAfterCase
// ---------------------------------------------------------------------------
const updateBeforeAfterCaseRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            procedureName: z.string().min(1).optional(),
            surgeonName: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            images: z.array(z.object({
              url: z.string(),
            })).optional(),
            media: z.array(caseMediaItemSchema).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Before/after case updated' } },
});

app.openapi(updateBeforeAfterCaseRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateBeforeAfterCase.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 14. DELETE /api/v2/hospitals/:hospitalId/materials/cases/:id — DeleteBeforeAfterCase
// ---------------------------------------------------------------------------
const deleteBeforeAfterCaseRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/cases/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Before/after case deleted' } },
});

app.openapi(deleteBeforeAfterCaseRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteBeforeAfterCase.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 15. GET /api/v2/hospitals/:hospitalId/materials/reviews — GetMaterialsReviews
// ---------------------------------------------------------------------------
const getMaterialsReviewsRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/reviews',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of hospital materials reviews' } },
});

app.openapi(getMaterialsReviewsRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'reviews');
  const result = await svc.getMaterialsReviews.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 16. POST /api/v2/hospitals/:hospitalId/materials/reviews — CreateMaterialsReview
// ---------------------------------------------------------------------------
const createMaterialsReviewRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/reviews',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createReviewSchema,
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Hospital materials review created' } },
});

app.openapi(createMaterialsReviewRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'reviews');
  const result = await svc.createMaterialsReview.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 17. PUT /api/v2/hospitals/:hospitalId/materials/reviews/:id — UpdateMaterialsReview
// ---------------------------------------------------------------------------
const updateMaterialsReviewRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/reviews/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateReviewSchema,
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Hospital materials review updated' } },
});

app.openapi(updateMaterialsReviewRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'reviews');
  const result = await svc.updateMaterialsReview.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 18. DELETE /api/v2/hospitals/:hospitalId/materials/reviews/:id — DeleteMaterialsReview
// ---------------------------------------------------------------------------
const deleteMaterialsReviewRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/reviews/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Hospital materials review deleted' } },
});

app.openapi(deleteMaterialsReviewRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'reviews');
  await svc.deleteMaterialsReview.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 19. GET /api/v2/hospitals/:hospitalId/materials/packages — GetMaterialsPackages
// ---------------------------------------------------------------------------
const getMaterialsPackagesRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/packages',
  request: { params: hospitalIdParamSchema },
  responses: { 200: { description: 'List of hospital materials packages' } },
});

app.openapi(getMaterialsPackagesRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'packages');
  const result = await svc.getMaterialsPackages.execute(hospitalId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 20. GET /api/v2/hospitals/:hospitalId/materials/packages/:id — GetMaterialsPackage
// ---------------------------------------------------------------------------
const getMaterialsPackageRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/materials/packages/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 200: { description: 'Hospital materials package details' } },
});

app.openapi(getMaterialsPackageRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'packages');
  const result = await svc.getMaterialsPackage.execute(hospitalId, id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 21. POST /api/v2/hospitals/:hospitalId/materials/packages — CreateMaterialsPackage
// ---------------------------------------------------------------------------
const createMaterialsPackageRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/packages',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createPackageSchema,
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Hospital materials package created' } },
});

app.openapi(createMaterialsPackageRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'packages');
  const result = await svc.createMaterialsPackage.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 22. PUT /api/v2/hospitals/:hospitalId/materials/packages/:id — UpdateMaterialsPackage
// ---------------------------------------------------------------------------
const updateMaterialsPackageRoute = createRoute({
  method: 'put',
  path: '/api/v2/hospitals/{hospitalId}/materials/packages/{id}',
  request: {
    params: hospitalIdAndIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updatePackageSchema,
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Hospital materials package updated' } },
});

app.openapi(updateMaterialsPackageRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'packages');
  const result = await svc.updateMaterialsPackage.execute(hospitalId, id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 23. DELETE /api/v2/hospitals/:hospitalId/materials/packages/:id — DeleteMaterialsPackage
// ---------------------------------------------------------------------------
const deleteMaterialsPackageRoute = createRoute({
  method: 'delete',
  path: '/api/v2/hospitals/{hospitalId}/materials/packages/{id}',
  request: { params: hospitalIdAndIdParamSchema },
  responses: { 204: { description: 'Hospital materials package deleted' } },
});

app.openapi(deleteMaterialsPackageRoute, async (c) => {
  const { hospitalId, id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getMaterialsRouteServices();
  await assertRegularMaterialsFeature(svc, hospitalId, 'packages');
  await svc.deleteMaterialsPackage.execute(hospitalId, id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 24. POST /api/v2/hospitals/:hospitalId/materials/upload — InitMaterialsUpload
// ---------------------------------------------------------------------------
const materialsUploadInitSchema = z.object({
  materialKind: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});

const materialsUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/materials/upload',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: materialsUploadInitSchema,
        },
      },
      required: true,
    },
  },
  responses: { 201: { description: 'Upload intent created' } },
});

app.openapi(materialsUploadRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  // Access control: HOSPITAL role may only upload for their own hospital
  if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
    throw new ForbiddenError('Access denied to this hospital');
  }

  const hospitalType = await svc.resolveHospitalType(hospitalId);
  const policyId = resolveMaterialsPolicyId(hospitalType, body.materialKind);

  const uploadResult = await svc.mediaUpload.createUploadIntent({
    policyId,
    ownerType: 'hospital_material',
    ownerId: hospitalId,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  return c.json({
    upload: {
      uploadUrl: uploadResult.uploadUrl,
      storageKey: uploadResult.storageKey,
      expiresIn: uploadResult.expiresIn,
    },
    asset: uploadResult.asset,
  }, 201);
});

export default app;
