import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { guides } from '@medical-crm/infrastructure/database/schema';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import {
  emptyGuideContentDocument,
  guideContentImageKeys,
  guideContentText,
  isGuideImageStorageKey,
  normalizeGuideContent,
  renderGuideContentHtml,
  type GuideContentDocument,
} from '../guide-content.js';

const app = new OpenAPIHono();
export const publicGuidesRoutes = new OpenAPIHono();
const categoryValues = [
  'china_healthcare', 'treatment', 'clinical_trials_advanced_treatments',
  'hospital', 'patient_journey', 'cost_insurance', 'patient_education_faq',
] as const;
const categorySchema = z.enum(categoryValues);
const statusSchema = z.enum(['DRAFT', 'PUBLISHED']);
const faqSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(10000),
});
const guideInputSchema = z.object({
  title: z.string().trim().min(3).max(300),
  subtitle: z.string().trim().max(2000).optional().default(''),
  heroImageStorageKey: z.string().min(1).max(1000).optional().nullable(),
  category: categorySchema,
  reviewedBy: z.string().trim().max(200).optional().default(''),
  updatedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  keyTakeaways: z.array(z.string().trim().min(1).max(700)).max(8).optional().default([]),
  contentDocument: z.unknown().optional().default(emptyGuideContentDocument),
  relatedHospitalIds: z.array(z.string().uuid()).max(50).optional().default([]),
  relatedTreatments: z.array(z.object({
    procedureId: z.string().uuid(),
    hospitalId: z.string().uuid(),
    procedureName: z.string().trim().min(1).max(200),
    hospitalName: z.string().trim().min(1).max(200),
  })).max(50).optional().default([]),
  relatedGuideIds: z.array(z.string().uuid()).max(30).optional().default([]),
  faqs: z.array(faqSchema).max(30).optional().default([]),
  status: statusSchema.optional().default('DRAFT'),
  slug: z.string().trim().min(3).max(220).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
});
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: categorySchema.optional(),
  status: statusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
const idParams = z.object({ id: z.string().uuid() });
const procedureDirectoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(200).optional(),
});
const publicGuideSlugParams = z.object({ slug: z.string().min(3).max(220) });
const publicGuideImageQuerySchema = z.object({ key: z.string().min(1).max(1000) });

function requireAdmin(session: Session) {
  const actor = toActor(session);
  if (actor.role !== 'ADMIN') throw new ForbiddenError('Admin only');
  return actor;
}

function slugify(value: string) {
  const result = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
  return result || `guide-${Date.now()}`;
}

async function makeUniqueSlug(requested: string, excludeId?: string): Promise<string> {
  const base = slugify(requested);
  let candidate = base;
  let number = 2;
  while (true) {
    const predicates = [eq(guides.slug, candidate)];
    if (excludeId) predicates.push(ne(guides.id, excludeId));
    const existing = await getServices().crmDb.select({ id: guides.id }).from(guides).where(and(...predicates)).limit(1);
    if (!existing.length) return candidate;
    candidate = `${base.slice(0, 200 - String(number).length - 1)}-${number}`;
    number += 1;
  }
}

function publicGuideImageUrl(slug: string, storageKey: string) {
  const base = process.env['PUBLIC_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://crmapi.medicaltourismchina.health';
  return `${base}/api/v2/public/guides/${encodeURIComponent(slug)}/images?key=${encodeURIComponent(storageKey)}`;
}

function validatedContent(input: z.infer<typeof guideInputSchema>): GuideContentDocument {
  const contentDocument = normalizeGuideContent(input.contentDocument);
  if (!contentDocument) throw new HTTPException(400, { message: 'Guide content contains unsupported or invalid blocks' });
  return contentDocument;
}

function valuesFor(input: z.infer<typeof guideInputSchema>, slug: string) {
  const now = new Date().toISOString();
  const contentDocument = validatedContent(input);
  const heroImageStorageKey = input.heroImageStorageKey || null;
  if (heroImageStorageKey && !isGuideImageStorageKey(heroImageStorageKey)) {
    throw new HTTPException(400, { message: 'Hero image must be uploaded through the Guide image uploader' });
  }
  return {
    slug,
    title: input.title,
    subtitle: input.subtitle || null,
    heroImageStorageKey,
    category: input.category,
    reviewedBy: input.reviewedBy || null,
    updatedDate: input.updatedDate ?? now.slice(0, 10),
    keyTakeaways: input.keyTakeaways,
    contentDocument,
    contentHtml: renderGuideContentHtml(contentDocument, (key) => publicGuideImageUrl(slug, key)),
    contentText: guideContentText(contentDocument),
    relatedHospitalIds: input.relatedHospitalIds,
    relatedTreatments: input.relatedTreatments,
    relatedGuideIds: input.relatedGuideIds,
    faqs: input.faqs,
    status: input.status,
    publishedAt: input.status === 'PUBLISHED' ? now : null,
    updatedAt: now,
  };
}

async function toGuideResponse(row: typeof guides.$inferSelect) {
  const storageKey = isGuideImageStorageKey(row.heroImageStorageKey) ? row.heroImageStorageKey : null;
  let heroImageUrl: string | null = null;
  if (storageKey) {
    const signed = await getServices().storage.getSignedUrls([storageKey]);
    heroImageUrl = signed[storageKey] ?? null;
  }
  const contentDocument = normalizeGuideContent(row.contentDocument) ?? emptyGuideContentDocument;
  const contentImageKeys = guideContentImageKeys(contentDocument);
  const contentImageUrls = contentImageKeys.length ? await getServices().storage.getSignedUrls(contentImageKeys) : {};
  const { contentSections: _contentSections, ...guide } = row;
  return {
    ...guide,
    heroImageStorageKey: storageKey ?? null,
    heroImageUrl,
    contentDocument,
    contentImageUrls,
  };
}

app.openapi(createRoute({
  method: 'post', path: '/api/v2/guides',
  request: { body: { content: { 'application/json': { schema: guideInputSchema } }, required: true } },
  responses: { 201: { description: 'Guide created' } },
}), async (c) => {
  requireAdmin(c.get('session') as Session);
  const input = c.req.valid('json');
  const slug = await makeUniqueSlug(input.slug ?? input.title);
  const [guide] = await getServices().crmDb.insert(guides).values(valuesFor(input, slug)).returning();
  return c.json(await toGuideResponse(guide!), 201);
});

publicGuidesRoutes.openapi(createRoute({
  method: 'get', path: '/api/v2/public/guides/{slug}',
  request: { params: publicGuideSlugParams }, responses: { 200: { description: 'Published guide HTML document' } },
}), async (c) => {
  const { slug } = c.req.valid('param');
  const [guide] = await getServices().crmDb.select().from(guides).where(and(eq(guides.slug, slug), eq(guides.status, 'PUBLISHED'))).limit(1);
  if (!guide) throw new NotFoundError('Published guide not found');
  const contentDocument = normalizeGuideContent(guide.contentDocument) ?? emptyGuideContentDocument;
  return c.json({
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    subtitle: guide.subtitle,
    category: guide.category,
    reviewedBy: guide.reviewedBy,
    updatedDate: guide.updatedDate,
    keyTakeaways: guide.keyTakeaways,
    contentHtml: guide.contentHtml || renderGuideContentHtml(contentDocument, (key) => publicGuideImageUrl(guide.slug, key)),
    relatedHospitalIds: guide.relatedHospitalIds,
    relatedTreatments: guide.relatedTreatments,
    relatedGuideIds: guide.relatedGuideIds,
    faqs: guide.faqs,
    heroImageUrl: isGuideImageStorageKey(guide.heroImageStorageKey) ? publicGuideImageUrl(guide.slug, guide.heroImageStorageKey) : null,
    publishedAt: guide.publishedAt,
  });
});

publicGuidesRoutes.openapi(createRoute({
  method: 'get', path: '/api/v2/public/guides/{slug}/images',
  request: { params: publicGuideSlugParams, query: publicGuideImageQuerySchema },
  responses: { 302: { description: 'Redirect to a guide image' } },
}), async (c) => {
  const { slug } = c.req.valid('param');
  const { key } = c.req.valid('query');
  const [guide] = await getServices().crmDb.select({ heroImageStorageKey: guides.heroImageStorageKey, contentDocument: guides.contentDocument }).from(guides).where(and(eq(guides.slug, slug), eq(guides.status, 'PUBLISHED'))).limit(1);
  if (!guide) throw new NotFoundError('Published guide not found');
  const contentDocument = normalizeGuideContent(guide.contentDocument) ?? emptyGuideContentDocument;
  const availableKeys = new Set([guide.heroImageStorageKey, ...guideContentImageKeys(contentDocument)].filter(isGuideImageStorageKey));
  if (!availableKeys.has(key)) throw new NotFoundError('Guide image not found');
  const signed = await getServices().storage.getSignedUrls([key]);
  const url = signed[key];
  if (!url) throw new NotFoundError('Guide image not found');
  return c.redirect(url, 302);
});

const guideHeroImageUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
  kind: z.enum(['hero', 'content']).optional().default('hero'),
});
app.openapi(createRoute({
  method: 'post', path: '/api/v2/guides/images/upload-init',
  request: { body: { content: { 'application/json': { schema: guideHeroImageUploadSchema } }, required: true } },
  responses: { 201: { description: 'Guide image upload initialized' } },
}), async (c) => {
  requireAdmin(c.get('session') as Session);
  const body = c.req.valid('json');
  const result = await getServices().mediaUpload.createUploadIntent({
    policyId: body.kind === 'content' ? 'guide_content_image' : 'guide_hero_image',
    ownerType: 'guide',
    ownerId: `draft_${randomUUID()}`,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });
  return c.json({ upload: { uploadUrl: result.uploadUrl, storageKey: result.storageKey, expiresIn: result.expiresIn }, asset: result.asset }, 201);
});

app.openapi(createRoute({
  method: 'get', path: '/api/v2/guides',
  request: { query: listQuerySchema }, responses: { 200: { description: 'Paginated guide list' } },
}), async (c) => {
  requireAdmin(c.get('session') as Session);
  const query = c.req.valid('query');
  const conditions = [] as ReturnType<typeof eq>[];
  if (query.category) conditions.push(eq(guides.category, query.category));
  if (query.status) conditions.push(eq(guides.status, query.status));
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(guides.title, term), ilike(guides.subtitle, term)) as ReturnType<typeof eq>);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const db = getServices().crmDb;
  const [data, totals] = await Promise.all([
    db.select().from(guides).where(where).orderBy(desc(guides.updatedAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    db.select({ total: count() }).from(guides).where(where),
  ]);
  return c.json({ data: await Promise.all(data.map(toGuideResponse)), total: Number(totals[0]?.total ?? 0), page: query.page, limit: query.limit });
});

app.openapi(createRoute({
  method: 'get', path: '/api/v2/guides/procedures',
  request: { query: procedureDirectoryQuerySchema },
  responses: { 200: { description: 'One page of the procedure directory' } },
}), async (c) => {
  const actor = requireAdmin(c.get('session') as Session);
  const { page, search } = c.req.valid('query');
  const hospitalPage = await getServices().listHospitals.execute({ page, limit: 8, status: 'ACTIVE' }, actor);
  const rows = await Promise.all(hospitalPage.data.map(async (hospital) => {
    const procedures = await getServices().getProcedures.execute(hospital.id, actor);
    return procedures.map((procedure) => ({
      procedureId: procedure.id,
      hospitalId: hospital.id,
      procedureName: procedure.procedureName,
      hospitalName: hospital.nameEn || hospital.name,
    }));
  }));
  const term = search?.toLowerCase();
  const data = rows.flat().filter((item) => !term || `${item.procedureName} ${item.hospitalName}`.toLowerCase().includes(term));
  return c.json({ data, page, hasMore: hospitalPage.hasMore });
});

app.openapi(createRoute({
  method: 'get', path: '/api/v2/guides/{id}', request: { params: idParams }, responses: { 200: { description: 'Guide' } },
}), async (c) => {
  requireAdmin(c.get('session') as Session);
  const { id } = c.req.valid('param');
  const [guide] = await getServices().crmDb.select().from(guides).where(eq(guides.id, id)).limit(1);
  if (!guide) throw new NotFoundError(`Guide not found: ${id}`);
  return c.json(await toGuideResponse(guide));
});

app.openapi(createRoute({
  method: 'patch', path: '/api/v2/guides/{id}',
  request: { params: idParams, body: { content: { 'application/json': { schema: guideInputSchema } }, required: true } },
  responses: { 200: { description: 'Guide updated' } },
}), async (c) => {
  requireAdmin(c.get('session') as Session);
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = getServices().crmDb;
  const [existing] = await db.select({ slug: guides.slug, publishedAt: guides.publishedAt }).from(guides).where(eq(guides.id, id)).limit(1);
  if (!existing) throw new NotFoundError(`Guide not found: ${id}`);
  const slug = input.slug ? await makeUniqueSlug(input.slug, id) : existing.slug;
  const values = valuesFor(input, slug);
  const [guide] = await db.update(guides).set({ ...values, publishedAt: input.status === 'PUBLISHED' ? existing.publishedAt ?? new Date().toISOString() : null }).where(eq(guides.id, id)).returning();
  return c.json(await toGuideResponse(guide!));
});

app.openapi(createRoute({
  method: 'delete', path: '/api/v2/guides/{id}', request: { params: idParams }, responses: { 204: { description: 'Guide deleted' } },
}), async (c) => {
  requireAdmin(c.get('session') as Session);
  const { id } = c.req.valid('param');
  const deleted = await getServices().crmDb.delete(guides).where(eq(guides.id, id)).returning({ id: guides.id });
  if (!deleted.length) throw new NotFoundError(`Guide not found: ${id}`);
  return c.body(null, 204);
});

const takeawaySchema = z.object({ title: z.string().trim().max(300).optional().default(''), contentDocument: z.unknown() });
app.openapi(createRoute({
  method: 'post', path: '/api/v2/guides/key-takeaways',
  request: { body: { content: { 'application/json': { schema: takeawaySchema } }, required: true } },
  responses: { 200: { description: 'AI-generated guide takeaways' } },
}), async (c) => {
  requireAdmin(c.get('session') as Session);
  const input = c.req.valid('json');
  const apiKey = process.env['OPENAI_API_KEY']?.trim();
  if (!apiKey) return c.json({ error: 'AI summarization is not configured' }, 503);
  const contentDocument = normalizeGuideContent(input.contentDocument);
  if (!contentDocument) throw new HTTPException(400, { message: 'Guide content contains unsupported or invalid blocks' });
  const source = guideContentText(contentDocument).slice(0, 50000);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env['GUIDES_SUMMARY_MODEL'] ?? 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'You are a medical-content editor. Return JSON {"takeaways":["..."]} with 3 to 5 concise, factual takeaways based only on the supplied source. Do not add diagnoses, treatment claims, guarantees, or facts absent from the source.' },
      { role: 'user', content: `Guide title: ${input.title || 'Untitled'}\n\n${source}` },
    ] }),
  });
  if (!response.ok) return c.json({ error: 'AI summarization failed' }, 502);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? '{}';
  let decoded: unknown;
  try { decoded = JSON.parse(content); } catch { return c.json({ error: 'AI returned an invalid summary' }, 502); }
  const parsed = z.object({ takeaways: z.array(z.string().trim().min(1).max(700)).min(1).max(8) }).safeParse(decoded);
  if (!parsed.success) return c.json({ error: 'AI returned an invalid summary' }, 502);
  return c.json(parsed.data);
});

export default app;
